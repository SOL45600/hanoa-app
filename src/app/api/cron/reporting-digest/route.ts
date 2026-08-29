/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lecture Supabase non cachée (sinon le throttle mensuel serait défait).
export const dynamic = 'force-dynamic'
export const revalidate = 0

const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'
const APP_URL = 'https://hanoa-app.vercel.app'
const COST_PER_KG: Record<string, number> = { D: 10, T: 12, P: 12, H: 7, C: 4 }

const eur = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
function prevMonthKey(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthBefore(m: string): string { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export async function GET(request: NextRequest) {
  if (request.headers.get('x-cron-job') !== process.env.CRON_SECRET_ALERT_WEENAT) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = request.nextUrl.searchParams.get('force') === '1'
  if (!RESEND_KEY) return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })

  const month = request.nextUrl.searchParams.get('month') || prevMonthKey()
  // Throttle : 1 envoi par mois maximum (s'applique même avec ?force=1)
  const { data: st } = await db.from('cron_state').select('last_sent').eq('key', 'reporting_digest').maybeSingle()
  const lastMonth = st?.last_sent ? (() => { const d = new Date(st.last_sent); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })() : null
  if (!force && lastMonth === new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')) {
    return NextResponse.json({ skipped: 'déjà envoyé ce mois', month })
  }
  await db.from('cron_state').upsert({ key: 'reporting_digest', last_sent: new Date().toISOString() }, { onConflict: 'key' })

  // Rapport du mois + mois précédent (pour la variation)
  const { data: rows } = await db.from('monthly_reports').select('*').in('month', [month, monthBefore(month)])
  const rep = (rows || []).find((r: any) => r.month === month)
  const prev = (rows || []).find((r: any) => r.month === monthBefore(month))

  // Stock valorisé (snapshot actuel)
  const { data: lots } = await db.from('finished_lots').select('product_type, units_remaining, units_produced, total_weight_kg, format').gt('units_produced', 0)
  let stock = 0
  for (const l of (lots || [])) {
    if ((l.units_remaining ?? 0) >= 9999) continue
    const ratio = l.units_produced ? (l.units_remaining || 0) / l.units_produced : 1
    const kg = l.total_weight_kg != null ? l.total_weight_kg * ratio : 0
    stock += kg * (COST_PER_KG[l.product_type] ?? 10)
  }

  const ca = rep?.ca ?? null
  const solde = rep?.bank_balance ?? null
  const cashDelta = (solde != null && prev?.bank_balance != null) ? solde - prev.bank_balance : null
  const d = rep?.data || {}

  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#2c2c2a">
      <h2 style="color:#0f6e56">Reporting — ${monthLabel(month)}</h2>
      <table style="border-collapse:collapse;width:100%;margin:14px 0">
        <tr><td style="padding:8px;background:#f5f2eb;font-size:13px;width:60%">Chiffre d'affaires HT (Sellsy)</td><td style="padding:8px;text-align:right;font-weight:700">${eur(ca)}</td></tr>
        <tr><td style="padding:8px;font-size:13px">Encaissements clients réels</td><td style="padding:8px;text-align:right">${eur(d.client_receipts)}</td></tr>
        <tr><td style="padding:8px;background:#f5f2eb;font-size:13px">Solde bancaire fin de mois</td><td style="padding:8px;text-align:right;font-weight:700">${eur(solde)}</td></tr>
        <tr><td style="padding:8px;font-size:13px">Variation de trésorerie</td><td style="padding:8px;text-align:right;color:${cashDelta != null && cashDelta < 0 ? '#c0392b' : '#0f6e56'}">${cashDelta == null ? '—' : (cashDelta >= 0 ? '+' : '') + eur(cashDelta)}</td></tr>
        <tr><td style="padding:8px;background:#f5f2eb;font-size:13px">dont déblocages de prêt (financement)</td><td style="padding:8px;text-align:right;color:#888">${eur(d.loan_drawdowns)}</td></tr>
        <tr><td style="padding:8px;font-size:13px">Stock valorisé (actuel)</td><td style="padding:8px;text-align:right">${eur(stock)}</td></tr>
      </table>
      ${d.note ? `<div style="background:#eef6f2;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5"><strong>Analyse :</strong> ${d.note}</div>` : ''}
      ${!rep ? `<p style="color:#c0392b;font-size:13px">⚠️ Le relevé bancaire de ${monthLabel(month)} n'a pas encore été saisi — seuls le CA et le stock sont à jour.</p>` : ''}
      <p style="font-size:13px;color:#888;margin-top:16px">Compte de résultat complet (charges, EBE, résultat net) : à venir avec le flux de dépenses (Phase 2).</p>
      <a href="${APP_URL}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#0f6e56;color:white;border-radius:8px;text-decoration:none;font-size:14px">Ouvrir le Reporting →</a>
    </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Projet SOL Reporting <reporting@s-o-l.fr>',
      to: [ALERT_EMAIL],
      subject: `📊 Reporting financier — ${monthLabel(month)}`,
      html,
    }),
  })
  return NextResponse.json({ month, sent: res.ok, has_report: !!rep, stock: Math.round(stock) })
}
