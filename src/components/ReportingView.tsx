'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

// Coût de valorisation du stock (€/kg) par type de produit — À CONFIRMER par Benjamin.
const COST_PER_KG: Record<string, number> = { D: 10, T: 12, P: 12, H: 7, C: 4 }
const COST_DEFAULT = 10

const fmtEur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
const curMonthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function parseFmtKg(fmt: string): number {
  const m = (fmt || '').toLowerCase().match(/^([\d.,]+)\s*(kg|g|l|cl|ml)/)
  if (!m) return 0
  let v = parseFloat(m[1].replace(',', '.')); const u = m[2]
  if (u === 'g' || u === 'ml') v /= 1000
  if (u === 'cl') v /= 100
  return v
}

interface SavedReport { month: string; ca: number | null; bank_balance: number | null; stock_value: number | null; charges: number | null; data?: any }

export default function ReportingView({ supabase, profile }: { supabase: SupabaseClient; profile: Profile }) {
  const [monthly, setMonthly] = useState<Record<string, number>>({})
  const [stockNow, setStockNow] = useState<{ value: number; byProduct: { name: string; kg: number; value: number }[] } | null>(null)
  const [saved, setSaved] = useState<Record<string, SavedReport>>({})
  const [month, setMonth] = useState(curMonthKey())
  const [bank, setBank] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const pdfPath = saved[month]?.data?.pdf_path as string | undefined
  const downloadPdf = async () => {
    if (!pdfPath) return
    const { data } = await supabase.storage.from('hanoa-files').createSignedUrl(pdfPath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  useEffect(() => {
    if (profile.role !== 'admin') return
    // CA mensuel Sellsy
    fetch('/api/sellsy?type=dashboard').then(r => r.json()).then(d => setMonthly(d.monthly_breakdown || {})).catch(() => {})
    // Stock valorisé (snapshot actuel)
    supabase.from('finished_lots').select('product_type, product_name, format, units_remaining, units_produced, total_weight_kg')
      .gt('units_produced', 0).then(({ data }) => {
        const byP: Record<string, { name: string; kg: number; value: number }> = {}
        let total = 0
        for (const l of (data || [])) {
          if ((l.units_remaining ?? 0) >= 9999) continue // exclut les lots de test
          const ratio = l.units_produced ? (l.units_remaining || 0) / l.units_produced : 1
          const kg = l.total_weight_kg != null ? l.total_weight_kg * ratio : parseFmtKg(l.format) * (l.units_remaining || 0)
          const cost = COST_PER_KG[l.product_type] ?? COST_DEFAULT
          const val = kg * cost
          total += val
          const key = l.product_name || l.product_type
          if (!byP[key]) byP[key] = { name: key, kg: 0, value: 0 }
          byP[key].kg += kg; byP[key].value += val
        }
        setStockNow({ value: total, byProduct: Object.values(byP).sort((a, b) => b.value - a.value) })
      })
    // Rapports sauvegardés
    supabase.from('monthly_reports').select('*').then(({ data }) => {
      const map: Record<string, SavedReport> = {}
      ;(data || []).forEach((r: any) => map[r.month] = r)
      setSaved(map)
    })
  }, [supabase, profile.role])

  useEffect(() => { setBank(saved[month]?.bank_balance != null ? String(saved[month]!.bank_balance) : '') }, [month, saved])

  const caMonth = monthly[month] ?? saved[month]?.ca ?? 0
  const prevMonthKey = useMemo(() => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }, [month])
  const prevBank = saved[prevMonthKey]?.bank_balance ?? null
  const bankNum = bank === '' ? null : parseFloat(bank.replace(',', '.'))
  const cashDelta = (bankNum != null && prevBank != null) ? bankNum - prevBank : null

  const allMonths = useMemo(() => Array.from(new Set([...Object.keys(monthly), ...Object.keys(saved), curMonthKey()])).sort(), [monthly, saved])
  const chartData = allMonths.map(m => ({ month: m.slice(2), CA: Math.round(monthly[m] ?? saved[m]?.ca ?? 0), Tréso: saved[m]?.bank_balance ?? null }))

  const save = async () => {
    setSaving(true); setMsg('')
    const row = { month, ca: caMonth, bank_balance: bankNum, stock_value: stockNow?.value ?? null, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('monthly_reports').upsert(row, { onConflict: 'month' })
    if (error) { setMsg('Erreur : ' + error.message); setSaving(false); return }
    setSaved(s => ({ ...s, [month]: { ...(s[month] || {} as any), ...row } }))
    setMsg('✓ Rapport du mois enregistré'); setSaving(false)
  }

  const exportCsv = () => {
    const headers = ['Mois', 'CA HT', 'Stock valorisé', 'Solde bancaire', 'Charges', 'Variation tréso']
    const rows = allMonths.map((m, i) => {
      const s = saved[m]; const pb = i > 0 ? saved[allMonths[i - 1]]?.bank_balance : null
      const cd = (s?.bank_balance != null && pb != null) ? s.bank_balance - pb : ''
      return [m, Math.round(monthly[m] ?? s?.ca ?? 0), s?.stock_value ?? '', s?.bank_balance ?? '', s?.charges ?? '', cd]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `reporting-mensuel.csv`; a.click()
  }

  if (profile.role !== 'admin') return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Accès réservé à l&apos;administrateur.</div>

  const card: CSSProperties = { background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }
  const h3: CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', marginBottom: 12 }
  const kpi = (label: string, value: string, sub?: string, color = '#0f6e56') => (
    <div style={{ flex: '1 1 160px', background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '4px 2px 40px' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, marginBottom: 4 }}>Reporting mensuel</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 18 }}>
        Phase 1 : CA (Sellsy), stock valorisé, trésorerie. Les charges &amp; le P&amp;L complet arriveront en Phase 2 (dépenses).
      </p>

      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Mois</label>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 10px', border: '0.5px solid var(--border-mid)', borderRadius: 7, fontSize: 14, background: '#fafaf8' }}>
            {allMonths.slice().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Solde bancaire fin de mois (€)</label>
          <input value={bank} onChange={e => setBank(e.target.value)} inputMode="decimal" placeholder="relevé CA"
            style={{ padding: '8px 10px', border: '0.5px solid var(--border-mid)', borderRadius: 7, fontSize: 14, background: '#fafaf8', width: 140 }} />
        </div>
        <button onClick={save} disabled={saving} style={{ padding: '9px 16px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontFamily: 'Georgia, serif' }}>{saving ? '…' : 'Enregistrer le mois'}</button>
        {pdfPath && <button onClick={downloadPdf} style={{ padding: '9px 14px', border: '0.5px solid var(--green)', color: 'var(--green)', borderRadius: 8, background: '#fff', fontFamily: 'Georgia, serif' }}>📄 Télécharger le PDF</button>}
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--green)' : '#d85a30' }}>{msg}</span>}
      </div>

      {/* KPIs du mois */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('CA HT (Sellsy)', fmtEur(caMonth), monthLabel(month))}
        {kpi('Stock valorisé (actuel)', stockNow ? fmtEur(stockNow.value) : '…', 'snapshot', '#185fa5')}
        {kpi('Solde bancaire', bankNum != null ? fmtEur(bankNum) : '—', 'saisi', '#ba7517')}
        {kpi('Variation trésorerie', cashDelta != null ? (cashDelta >= 0 ? '+' : '') + fmtEur(cashDelta) : '—', `vs ${monthLabel(prevMonthKey)}`, cashDelta != null && cashDelta < 0 ? '#c0392b' : '#0f6e56')}
      </div>

      {/* P&L — placeholders Phase 2 */}
      <div style={card}>
        <h3 style={h3}>Compte de résultat — {monthLabel(month)}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <tbody>
            {[
              ['Chiffre d\'affaires HT', fmtEur(caMonth), '#0f6e56'],
              ['− Achats / coût des ventes', 'Phase 2', '#bbb'],
              ['= Marge brute', 'Phase 2', '#bbb'],
              ['− Charges externes', 'Phase 2', '#bbb'],
              ['− Salaires & charges', 'Phase 2', '#bbb'],
              ['= EBE', 'Phase 2', '#bbb'],
              ['− Amortissements & intérêts', 'Phase 2', '#bbb'],
              ['= Résultat net', 'Phase 2', '#bbb'],
            ].map(([k, v, c], i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                <td style={{ padding: '8px 4px', color: String(k).startsWith('=') ? '#333' : '#666', fontWeight: String(k).startsWith('=') ? 600 : 400 }}>{k}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600, color: c as string }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Les lignes « Phase 2 » se rempliront dès que le flux de dépenses (scraping mails / relevé bancaire) sera branché.</p>
      </div>

      {/* Détail stock valorisé */}
      {stockNow && (
        <div style={card}>
          <h3 style={h3}>Stock valorisé — détail (coûts €/kg à confirmer)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {stockNow.byProduct.map(p => (
                <tr key={p.name} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 4px' }}>{p.name}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: '#888' }}>{p.kg.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kg</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(p.value)}</td>
                </tr>
              ))}
              <tr><td style={{ padding: '6px 4px', fontWeight: 700 }}>TOTAL</td><td /><td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 800, color: '#185fa5' }}>{fmtEur(stockNow.value)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Graphique CA + trésorerie */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ ...h3, marginBottom: 0 }}>CA mensuel &amp; trésorerie</h3>
          <button onClick={exportCsv} style={{ fontSize: 13, padding: '6px 12px', border: '0.5px solid var(--border)', borderRadius: 8, color: '#555' }}>⬇ Export Excel</button>
        </div>
        <div style={{ width: '100%', height: 300, marginTop: 12 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: any) => fmtEur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="CA" fill="#7fb069" radius={[3, 3, 0, 0]} />
              <Line dataKey="Tréso" stroke="#ba7517" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
