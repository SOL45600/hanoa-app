'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import WeenatView from './WeenatView'
import { IRRIG_PROGRAMS, IRRIG_PARCELS, IRRIG_FIXED_M3, IRRIG_ROWS, IRRIG_COLORS } from '@/lib/irrigation'

// Débit m³/h par parcelle — pour la saisie manuelle individuelle (à renseigner).
const PARCEL_FLOW: Record<string, number> = { A: 0, B1: 0, B2: 0, C: 0, D1: 0, D2: 0, E: 0 }
const SUBSETS = ['Nouveaux vergers', 'Jardin'] // volumes fixes (composantes du Programme C)
const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

interface Log { id: string; date: string; parcel: string; hours: number | null; m3: number | null; auto?: boolean }

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function IrrigationView({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const [tab, setTab] = useState<'suivi' | 'weenat'>('suivi')
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: today(), parcel: 'Programme B', hours: '', flow: '', m3: String(IRRIG_FIXED_M3['Programme B']) })
  const [year, setYear] = useState(new Date().getFullYear())

  const load = async () => {
    const { data } = await supabase.from('irrigation_logs').select('*').order('date', { ascending: false })
    setLogs((data || []) as Log[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const recalc = (hours: string, flow: string) => {
    const h = parseFloat(hours.replace(',', '.')); const f = parseFloat(flow.replace(',', '.'))
    return (h > 0 && f > 0) ? String(Math.round(h * f * 10) / 10) : ''
  }
  const isFixed = IRRIG_FIXED_M3[form.parcel] != null
  const onParcel = (p: string) => setForm(f => {
    if (IRRIG_FIXED_M3[p] != null) return { ...f, parcel: p, flow: '', m3: String(IRRIG_FIXED_M3[p]) }
    const flow = String(PARCEL_FLOW[p] || (f.flow || ''))
    return { ...f, parcel: p, flow, m3: recalc(f.hours, flow) }
  })
  const onHours = (v: string) => setForm(f => ({ ...f, hours: v, m3: recalc(v, f.flow) }))
  const onFlow = (v: string) => setForm(f => ({ ...f, flow: v, m3: recalc(f.hours, v) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setSaving(true)
    const { data, error } = await supabase.from('irrigation_logs').insert({
      date: form.date, parcel: form.parcel,
      hours: form.hours ? parseFloat(form.hours.replace(',', '.')) : null,
      m3: form.m3 ? parseFloat(form.m3.replace(',', '.')) : null,
      auto: false, created_by: userId,
    }).select('*').single()
    if (error || !data) { setErr(error?.message || 'Erreur — la table irrigation_logs existe-t-elle ?'); setSaving(false); return }
    setLogs(xs => [data as Log, ...xs])
    setForm(f => ({ ...f, hours: '', m3: isFixed ? f.m3 : '' }))
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Supprimer ce relevé ? (le passera comme "non irrigué" ce jour-là)')) return
    await supabase.from('irrigation_logs').delete().eq('id', id)
    setLogs(xs => xs.filter(x => x.id !== id))
  }
  // Modifier le m³ d'un relevé → devient "manuel" (le cron ne le régénèrera plus)
  const editM3 = async (id: string, v: string) => {
    const m3 = v === '' ? null : parseFloat(v.replace(',', '.'))
    setLogs(xs => xs.map(x => x.id === id ? { ...x, m3, auto: false } : x))
    await supabase.from('irrigation_logs').update({ m3, auto: false }).eq('id', id)
  }

  const years = useMemo(() => Array.from(new Set(logs.map(l => Number((l.date || '').slice(0, 4))).filter(Boolean))).sort((a, b) => b - a), [logs])

  const pivot = useMemo(() => {
    const grid: Record<string, number[]> = {}
    IRRIG_ROWS.forEach(p => grid[p] = Array(12).fill(0))
    logs.forEach(l => {
      if (Number((l.date || '').slice(0, 4)) !== year) return
      const m = Number((l.date || '').slice(5, 7)) - 1
      if (grid[l.parcel] && m >= 0 && m < 12) grid[l.parcel][m] += Number(l.m3) || 0
    })
    return grid
  }, [logs, year])

  const activeRows = IRRIG_ROWS.filter(p => pivot[p].some(v => v > 0))
  const displayRows = activeRows.length ? activeRows : ['Programme B']
  const monthTotals = MONTHS.map((_, m) => displayRows.reduce((s, p) => s + pivot[p][m], 0))
  const rowTotals = Object.fromEntries(IRRIG_ROWS.map(p => [p, pivot[p].reduce((s, v) => s + v, 0)]))
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0)

  const chartData = MONTHS.map((mn, m) => ({ month: mn, ...Object.fromEntries(displayRows.map(p => [p, Math.round(pivot[p][m] * 10) / 10])) }))
  const annualData = displayRows.map(p => ({ parcel: p, m3: Math.round(rowTotals[p] * 10) / 10 }))

  const exportCsv = () => {
    const headers = ['Programme / Parcelle', ...MONTHS, 'Total année']
    const rows = displayRows.map(p => [p, ...pivot[p].map(v => fmt(v)), fmt(rowTotals[p])])
    rows.push(['TOTAL', ...monthTotals.map(v => fmt(v)), fmt(grandTotal)])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `irrigation-${year}.csv`; a.click()
  }

  const card: CSSProperties = { background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }
  const input: CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid var(--border-mid)', borderRadius: 7, fontSize: 14, background: '#fafaf8', boxSizing: 'border-box' }
  const label: CSSProperties = { fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }
  const th: CSSProperties = { padding: '6px 8px', fontSize: 11, color: '#888', textAlign: 'right', borderBottom: '1px solid #eee' }
  const recentLogs = logs.filter(l => Number((l.date || '').slice(0, 4)) === year).slice(0, 80)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['suivi', '💧 Suivi irrigation'], ['weenat', '📡 Capteurs Weenat']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: tab === k ? 'var(--green)' : '#fff', color: tab === k ? '#fff' : '#555' }}>{lbl}</button>
        ))}
      </div>

      {tab === 'weenat' ? <WeenatView /> : (
        <>
          {/* Formulaire de relevé */}
          <form onSubmit={submit} style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Nouveau relevé d&apos;irrigation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, alignItems: 'end' }}>
              <div><label style={label}>Date</label><input style={input} type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><label style={label}>Programme / Parcelle</label>
                <select style={input} value={form.parcel} onChange={e => onParcel(e.target.value)}>
                  <optgroup label="Programmes (été, 1 jour sur 2)">
                    {IRRIG_PROGRAMS.map(p => <option key={p.key} value={p.label}>{p.label} — {IRRIG_FIXED_M3[p.label]} m³</option>)}
                  </optgroup>
                  <optgroup label="Sous-ensembles (volume fixe)">
                    {SUBSETS.map(s => <option key={s} value={s}>{s} — {IRRIG_FIXED_M3[s]} m³</option>)}
                  </optgroup>
                  <optgroup label="Parcelles">
                    {IRRIG_PARCELS.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                </select>
              </div>
              <div><label style={label}>Temps (h)</label><input style={input} inputMode="decimal" value={form.hours} onChange={e => onHours(e.target.value)} placeholder="ex : 3" disabled={isFixed} /></div>
              <div><label style={label}>Débit (m³/h)</label><input style={input} inputMode="decimal" value={form.flow} onChange={e => onFlow(e.target.value)} placeholder="ex : 12" disabled={isFixed} /></div>
              <div><label style={label}>Volume (m³)</label><input style={input} inputMode="decimal" value={form.m3} onChange={e => setForm(f => ({ ...f, m3: e.target.value }))} placeholder="auto" /></div>
              <button type="submit" disabled={saving} style={{ padding: '9px 14px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontFamily: 'Georgia, serif' }}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
            {isFixed && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                📋 Volume fixe {IRRIG_FIXED_M3[form.parcel]} m³ par passage (été, 1 jour sur 2). Les jours passés sont générés automatiquement — tu peux les corriger ci-dessous.
              </div>
            )}
            {err && <div style={{ marginTop: 10, background: '#faece7', color: '#d85a30', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>⚠️ {err}</div>}
          </form>

          {/* Tableau pivot + export */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Eau distribuée ({year}) — m³</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={{ ...input, width: 'auto' }} value={year} onChange={e => setYear(Number(e.target.value))}>
                  {(years.length ? years : [year]).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={exportCsv} style={{ fontSize: 13, padding: '7px 12px', border: '0.5px solid var(--border)', borderRadius: 8, color: '#555' }}>⬇ Export Excel</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                <thead>
                  <tr><th style={{ ...th, textAlign: 'left' }}>Programme / Parcelle</th>{MONTHS.map(m => <th key={m} style={th}>{m}</th>)}<th style={{ ...th, fontWeight: 700, color: '#333' }}>Total</th></tr>
                </thead>
                <tbody>
                  {displayRows.map(p => (
                    <tr key={p}>
                      <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 600, color: IRRIG_COLORS[p] || '#555' }}>{p}</td>
                      {pivot[p].map((v, m) => <td key={m} style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', color: v ? '#333' : '#ccc' }}>{v ? fmt(v) : '·'}</td>)}
                      <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{fmt(rowTotals[p])}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #eee' }}>
                    <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 700 }}>TOTAL</td>
                    {monthTotals.map((v, m) => <td key={m} style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{v ? fmt(v) : '·'}</td>)}
                    <td style={{ padding: '6px 8px', fontSize: 14, textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Graphiques */}
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Eau distribuée par mois ({year})</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `${v}`} />
                  <Tooltip formatter={(v: any) => `${fmt(Number(v))} m³`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {displayRows.map(p => <Bar key={p} dataKey={p} stackId="a" fill={IRRIG_COLORS[p] || '#999'} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Total annuel ({year})</h3>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={annualData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="parcel" fontSize={12} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: any) => `${fmt(Number(v))} m³`} />
                  <Bar dataKey="m3" radius={[4, 4, 0, 0]}>
                    {annualData.map(d => <Cell key={d.parcel} fill={IRRIG_COLORS[d.parcel] || '#999'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Derniers relevés — correction manuelle */}
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 4px' }}>Derniers relevés ({year})</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
              <span style={{ background: '#eef0ee', color: '#777', borderRadius: 5, padding: '1px 6px', fontSize: 11 }}>auto</span> = généré automatiquement ·
              modifier le m³ ou supprimer une ligne la passe en <span style={{ background: '#e7f2ec', color: '#0f6e56', borderRadius: 5, padding: '1px 6px', fontSize: 11 }}>manuel</span> (protégée du recalcul auto).
            </p>
            {recentLogs.length === 0 ? <p style={{ fontSize: 13, color: '#999' }}>Aucun relevé.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 460 }}>
                  <tbody>
                    {recentLogs.map(l => (
                      <tr key={l.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 8px', fontSize: 13, whiteSpace: 'nowrap', color: '#555' }}>{fmtDate(l.date)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 600, color: IRRIG_COLORS[l.parcel] || '#555' }}>{l.parcel}</td>
                        <td style={{ padding: '6px 8px', width: 90 }}>
                          <input defaultValue={l.m3 ?? ''} inputMode="decimal"
                            onBlur={e => { if (e.target.value !== String(l.m3 ?? '')) editM3(l.id, e.target.value) }}
                            style={{ width: 70, padding: '4px 6px', border: '0.5px solid var(--border-mid)', borderRadius: 6, fontSize: 13, textAlign: 'right', background: '#fafaf8' }} /> <span style={{ fontSize: 11, color: '#999' }}>m³</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ fontSize: 11, borderRadius: 5, padding: '1px 6px', background: l.auto ? '#eef0ee' : '#e7f2ec', color: l.auto ? '#777' : '#0f6e56' }}>{l.auto ? 'auto' : 'manuel'}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <button onClick={() => del(l.id)} title="Supprimer" style={{ color: '#d85a30', fontSize: 15, padding: '0 6px' }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {loading && <p style={{ color: '#999', fontSize: 13 }}>Chargement…</p>}
        </>
      )}
    </div>
  )
}
