'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import WeenatView from './WeenatView'

const PARCELS = ['A', 'B1', 'B2', 'C', 'D1', 'D2', 'E']
// Débit m³/h par parcelle — à renseigner (valeurs transmises par Benjamin).
const PARCEL_FLOW: Record<string, number> = {
  A: 0, B1: 0, B2: 0, C: 0, D1: 0, D2: 0, E: 0,
}
const PARCEL_COLORS: Record<string, string> = {
  A: '#0f6e56', B1: '#185fa5', B2: '#7ab0e0', C: '#ba7517', D1: '#6b4fbb', D2: '#b07fd0', E: '#d85a30',
}
const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

interface Log { id: string; date: string; parcel: string; hours: number | null; m3: number | null }

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function IrrigationView({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const [tab, setTab] = useState<'suivi' | 'weenat'>('suivi')
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: today(), parcel: 'A', hours: '', flow: String(PARCEL_FLOW['A'] || ''), m3: '' })
  const [year, setYear] = useState(new Date().getFullYear())

  const load = async () => {
    const { data } = await supabase.from('irrigation_logs').select('*').order('date', { ascending: false })
    setLogs((data || []) as Log[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Auto-calcul m³ = temps × débit (modifiable manuellement ensuite)
  const recalc = (hours: string, flow: string) => {
    const h = parseFloat(hours.replace(',', '.')); const f = parseFloat(flow.replace(',', '.'))
    return (h > 0 && f > 0) ? String(Math.round(h * f * 10) / 10) : ''
  }
  const onParcel = (p: string) => setForm(f => { const flow = String(PARCEL_FLOW[p] || (f.flow || '')); return { ...f, parcel: p, flow, m3: recalc(f.hours, flow) } })
  const onHours = (v: string) => setForm(f => ({ ...f, hours: v, m3: recalc(v, f.flow) }))
  const onFlow = (v: string) => setForm(f => ({ ...f, flow: v, m3: recalc(f.hours, v) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setSaving(true)
    const { data, error } = await supabase.from('irrigation_logs').insert({
      date: form.date, parcel: form.parcel,
      hours: form.hours ? parseFloat(form.hours.replace(',', '.')) : null,
      m3: form.m3 ? parseFloat(form.m3.replace(',', '.')) : null,
      created_by: userId,
    }).select('*').single()
    if (error || !data) { setErr(error?.message || 'Erreur — la table irrigation_logs existe-t-elle ?'); setSaving(false); return }
    setLogs(xs => [data as Log, ...xs])
    setForm(f => ({ ...f, hours: '', m3: '' }))
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Supprimer cet enregistrement ?')) return
    await supabase.from('irrigation_logs').delete().eq('id', id)
    setLogs(xs => xs.filter(x => x.id !== id))
  }

  const years = useMemo(() => Array.from(new Set(logs.map(l => Number((l.date || '').slice(0, 4))).filter(Boolean))).sort((a, b) => b - a), [logs])

  // Pivot parcelle × mois (m³) pour l'année sélectionnée
  const pivot = useMemo(() => {
    const grid: Record<string, number[]> = {}
    PARCELS.forEach(p => grid[p] = Array(12).fill(0))
    logs.forEach(l => {
      if (Number((l.date || '').slice(0, 4)) !== year) return
      const m = Number((l.date || '').slice(5, 7)) - 1
      if (grid[l.parcel] && m >= 0 && m < 12) grid[l.parcel][m] += Number(l.m3) || 0
    })
    return grid
  }, [logs, year])

  const monthTotals = MONTHS.map((_, m) => PARCELS.reduce((s, p) => s + pivot[p][m], 0))
  const parcelTotals = Object.fromEntries(PARCELS.map(p => [p, pivot[p].reduce((s, v) => s + v, 0)]))
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0)

  const chartData = MONTHS.map((mn, m) => ({ month: mn, ...Object.fromEntries(PARCELS.map(p => [p, Math.round(pivot[p][m] * 10) / 10])) }))
  const annualData = PARCELS.map(p => ({ parcel: p, m3: Math.round(parcelTotals[p] * 10) / 10 }))

  const exportCsv = () => {
    const headers = ['Parcelle', ...MONTHS, 'Total année']
    const rows = PARCELS.map(p => [p, ...pivot[p].map(v => fmt(v)), fmt(parcelTotals[p])])
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
  const flowMissing = PARCELS.every(p => !PARCEL_FLOW[p])

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
          {flowMissing && (
            <div style={{ ...card, background: '#fff8ec', color: '#9a6b15', fontSize: 13 }}>
              ⚙️ Les débits (m³/h) par parcelle ne sont pas encore renseignés — saisis-les dans le champ « débit » pour chaque relevé, ou envoie-les moi et je les pré-remplis automatiquement.
            </div>
          )}

          {/* Formulaire de relevé */}
          <form onSubmit={submit} style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Nouveau relevé d&apos;irrigation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, alignItems: 'end' }}>
              <div><label style={label}>Date</label><input style={input} type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><label style={label}>Parcelle</label>
                <select style={input} value={form.parcel} onChange={e => onParcel(e.target.value)}>
                  {PARCELS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={label}>Temps (h)</label><input style={input} inputMode="decimal" value={form.hours} onChange={e => onHours(e.target.value)} placeholder="ex : 3" /></div>
              <div><label style={label}>Débit (m³/h)</label><input style={input} inputMode="decimal" value={form.flow} onChange={e => onFlow(e.target.value)} placeholder="ex : 12" /></div>
              <div><label style={label}>Volume (m³)</label><input style={input} inputMode="decimal" value={form.m3} onChange={e => setForm(f => ({ ...f, m3: e.target.value }))} placeholder="auto" /></div>
              <button type="submit" disabled={saving} style={{ padding: '9px 14px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontFamily: 'Georgia, serif' }}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
            {err && <div style={{ marginTop: 10, background: '#faece7', color: '#d85a30', fontSize: 13, padding: '8px 10px', borderRadius: 8 }}>⚠️ {err}</div>}
          </form>

          {/* Tableau pivot + export */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Eau distribuée par parcelle ({year}) — m³</h3>
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
                  <tr><th style={{ ...th, textAlign: 'left' }}>Parcelle</th>{MONTHS.map(m => <th key={m} style={th}>{m}</th>)}<th style={{ ...th, fontWeight: 700, color: '#333' }}>Total</th></tr>
                </thead>
                <tbody>
                  {PARCELS.map(p => (
                    <tr key={p}>
                      <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 600, color: PARCEL_COLORS[p] }}>{p}</td>
                      {pivot[p].map((v, m) => <td key={m} style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', color: v ? '#333' : '#ccc' }}>{v ? fmt(v) : '·'}</td>)}
                      <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{fmt(parcelTotals[p])}</td>
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
                  {PARCELS.map(p => <Bar key={p} dataKey={p} stackId="a" fill={PARCEL_COLORS[p]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Total annuel par parcelle ({year})</h3>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={annualData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="parcel" fontSize={12} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: any) => `${fmt(Number(v))} m³`} />
                  <Bar dataKey="m3" radius={[4, 4, 0, 0]}>
                    {annualData.map(d => <Cell key={d.parcel} fill={PARCEL_COLORS[d.parcel]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {loading && <p style={{ color: '#999', fontSize: 13 }}>Chargement…</p>}
        </>
      )}
    </div>
  )
}
