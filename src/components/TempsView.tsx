'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'

export const TIME_ACTIVITIES = [
  'Plantation / remplacement',
  'Piquets / colliers / protections',
  'Irrigation',
  'Ferti / phyto',
  'Taille / drageons / capricorne',
  'Broyage',
  'Récolte',
  'Conditionnement / tri',
  'Entretien matériel',
  'Transformation',
  'Commandes',
  'Divers',
]
const PARCELS = ['A', 'B1', 'B2', 'C', 'D1', 'D2', 'E', 'Verger entier', '—']
const OPERATORS = ['Nathalie', 'Benjamin', 'Peter', 'Yannick', 'Ariel']
const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

interface Entry {
  id: string; date: string; operator: string; parcel?: string | null
  activity: string; hours: number; note?: string | null
}

const card: React.CSSProperties = { background: 'white', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const label: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid var(--border-mid)', borderRadius: 8, fontSize: 13, background: 'white' }
const btnGreen: React.CSSProperties = { padding: '9px 16px', background: 'var(--green)', color: 'white', borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif' }
const fr1 = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')

export default function TempsView({ supabase, userId, profile }: {
  supabase: SupabaseClient; userId: string; profile: Profile
}) {
  const today = new Date().toISOString().slice(0, 10)
  const firstName = (profile.full_name || '').split(' ')[0]
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({
    date: today, operator: OPERATORS.includes(firstName) ? firstName : 'Peter',
    parcel: 'Verger entier', activity: 'Divers', hours: '', note: '',
  })

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('time_entries').select('*').order('date', { ascending: false })
    if (error) setErr('Table manquante ? Exécute le SQL fourni. (' + error.message + ')')
    else setErr('')
    setEntries((data || []) as Entry[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const hours = parseFloat(form.hours.replace(',', '.'))
    if (!hours || hours <= 0) { setErr('Indique un nombre d\'heures valide.'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.from('time_entries').insert({
      date: form.date, operator: form.operator, parcel: form.parcel === '—' ? null : form.parcel,
      activity: form.activity, hours, note: form.note || null, created_by: userId,
    }).select('*').single()
    if (error) { setErr(error.message); setSaving(false); return }
    setEntries(xs => [data, ...xs])
    setForm(f => ({ ...f, hours: '', note: '' }))
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Supprimer ce pointage ?')) return
    await supabase.from('time_entries').delete().eq('id', id)
    setEntries(xs => xs.filter(x => x.id !== id))
  }

  // ── Récap année : activité × mois ──
  const yearEntries = entries.filter(e => (e.date || '').slice(0, 4) === String(year))
  const grid: Record<string, number[]> = {}
  TIME_ACTIVITIES.forEach(a => grid[a] = Array(12).fill(0))
  const other: number[] = Array(12).fill(0)
  const byOperator: Record<string, number> = {}
  let grandTotal = 0
  yearEntries.forEach(e => {
    const m = parseInt((e.date || '').slice(5, 7)) - 1
    if (m < 0 || m > 11) return
    const h = Number(e.hours) || 0
    if (grid[e.activity]) grid[e.activity][m] += h; else other[m] += h
    byOperator[e.operator || '—'] = (byOperator[e.operator || '—'] || 0) + h
    grandTotal += h
  })
  const rowTotal = (arr: number[]) => arr.reduce((s, x) => s + x, 0)
  const monthTotals = Array(12).fill(0).map((_, mi) =>
    TIME_ACTIVITIES.reduce((s, a) => s + grid[a][mi], 0) + other[mi])
  const years = Array.from(new Set(entries.map(e => (e.date || '').slice(0, 4)).filter(Boolean))).sort().reverse()
  if (!years.includes(String(year))) years.unshift(String(year))

  const exportCsv = () => {
    const header = ['Activité', ...MONTHS, 'Total (h)']
    const lines = [...TIME_ACTIVITIES.map(a => [a, ...grid[a].map(fr1), fr1(rowTotal(grid[a]))]),
      ['Autres', ...other.map(fr1), fr1(rowTotal(other))],
      ['TOTAL', ...monthTotals.map(fr1), fr1(grandTotal)]]
    const csv = [header, ...lines].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `recap-temps-${year}.csv`; a.click()
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {err && <div style={{ ...card, background: '#faece7', color: '#d85a30', fontSize: 13 }}>{err}</div>}

      {/* Saisie rapide */}
      <form onSubmit={submit} style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Pointer du temps</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div><label style={label}>Date *</label><input style={input} type="date" required value={form.date} onChange={e => setField('date', e.target.value)} /></div>
          <div><label style={label}>Opérateur *</label>
            <select style={input} value={form.operator} onChange={e => setField('operator', e.target.value)}>
              {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><label style={label}>Activité *</label>
            <select style={input} value={form.activity} onChange={e => setField('activity', e.target.value)}>
              {TIME_ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div><label style={label}>Parcelle</label>
            <select style={input} value={form.parcel} onChange={e => setField('parcel', e.target.value)}>
              {PARCELS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label style={label}>Heures *</label><input style={input} value={form.hours} onChange={e => setField('hours', e.target.value)} placeholder="ex : 3,5" /></div>
          <div><label style={label}>Note</label><input style={input} value={form.note} onChange={e => setField('note', e.target.value)} placeholder="optionnel" /></div>
        </div>
        <button type="submit" disabled={saving} style={{ ...btnGreen, marginTop: 14 }}>{saving ? 'Enregistrement…' : 'Ajouter le pointage'}</button>
      </form>

      {/* Récap année */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Récapitulatif heures — {year}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...input, width: 'auto' }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportCsv} style={{ ...input, width: 'auto', cursor: 'pointer', color: 'var(--green)' }}><i className="ti ti-download" /> Export</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Activité</th>
                {MONTHS.map(m => <th key={m} style={{ padding: '6px 6px' }}>{m}</th>)}
                <th style={{ padding: '6px 8px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {TIME_ACTIVITIES.map(a => {
                const t = rowTotal(grid[a]); if (t === 0) return null
                return (
                  <tr key={a} style={{ borderTop: '0.5px solid var(--border)', textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px' }}>{a}</td>
                    {grid[a].map((h, mi) => <td key={mi} style={{ padding: '6px 6px', color: h ? 'var(--text)' : '#ccc' }}>{h ? fr1(h) : '·'}</td>)}
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{fr1(t)}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '1.5px solid var(--border-mid)', textAlign: 'right', fontWeight: 700 }}>
                <td style={{ textAlign: 'left', padding: '6px 8px' }}>TOTAL</td>
                {monthTotals.map((h, mi) => <td key={mi} style={{ padding: '6px 6px' }}>{h ? fr1(h) : '·'}</td>)}
                <td style={{ padding: '6px 8px', color: 'var(--green)' }}>{fr1(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(byOperator).sort((a, b) => b[1] - a[1]).map(([op, h]) => (
            <span key={op}><strong style={{ color: 'var(--text)' }}>{op}</strong> : {fr1(h)} h</span>
          ))}
        </div>
      </div>

      {/* Derniers pointages */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Derniers pointages</h3>
        {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                  {['Date', 'Opérateur', 'Activité', 'Parcelle', 'Heures', 'Note', ''].map((h, k) => <th key={k} style={{ padding: '6px 8px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 60).map(e => (
                  <tr key={e.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '6px 8px' }}>{e.operator}</td>
                    <td style={{ padding: '6px 8px' }}>{e.activity}</td>
                    <td style={{ padding: '6px 8px' }}>{e.parcel}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{fr1(Number(e.hours))} h</td>
                    <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{e.note}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}><button onClick={() => del(e.id)} title="Supprimer" style={{ color: '#d85a30' }}><i className="ti ti-trash" /></button></td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>Aucun pointage</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
