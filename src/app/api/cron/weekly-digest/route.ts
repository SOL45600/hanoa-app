import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_KEY = process.env.RESEND_API_KEY
const APP_URL = 'https://hanoa-app.vercel.app'

const ROW_LABELS: Record<string, string> = {
  vergers_irrigation: 'Irrigation', vergers_ferti_phyto: 'Ferti-phyto',
  vergers_entretien: 'Entretien', vergers_divers: 'Vergers — divers',
  transfo_stabilisation: 'Stabilisation', transfo_laboratoire: 'Laboratoire',
  transfo_conditionnement: 'Conditionnement', divers: 'Divers', commandes: 'Commandes',
}

/* Lundi de la semaine d'une date, clé locale YYYY-MM-DD (cohérent avec le planning) */
function mondayKeyOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
const mondayKey = () => mondayKeyOf(new Date())

/* État hydrique : pluie 7j + potentiel des sondes (HPOT, plus négatif = plus sec) */
async function hydricBlock(): Promise<string> {
  try {
    const r = await fetch(`${APP_URL}/api/weenat?type=devices`, { cache: 'no-store' })
    const d = await r.json()
    const rain = d?.weather?.latest?.RR
    const sondes: string[] = (d?.tensiometers || []).map((t: any) => {
      const hpot = t?.latest?.HPOT
      const val = typeof hpot === 'number' ? `${Math.round(hpot)} kPa` : '—'
      const etat = typeof hpot === 'number'
        ? (hpot <= -60 ? '🔴 sec — irrigation à prévoir' : hpot <= -30 ? '🟡 moyennement humide' : '🟢 humide')
        : ''
      return `<tr><td style="padding:4px 8px;font-size:13px">${t.label}</td><td style="padding:4px 8px;font-size:13px">${val}</td><td style="padding:4px 8px;font-size:13px">${etat}</td></tr>`
    })
    return `
      <h3 style="color:#185fa5;margin-top:24px">💧 État hydrique des parcelles</h3>
      ${rain != null ? `<p style="font-size:13px">Pluie récente (station) : <strong>${rain} mm</strong></p>` : ''}
      <table style="border-collapse:collapse;width:100%;background:#f7fafc;border-radius:8px">
        <tr style="font-size:11px;color:#888"><td style="padding:4px 8px">Sonde</td><td style="padding:4px 8px">Potentiel</td><td style="padding:4px 8px">État</td></tr>
        ${sondes.join('')}
      </table>
      <p style="font-size:11px;color:#aaa">Repère : ≤ −60 kPa = sol sec (irriguer) · −30 à −60 = moyen · ≥ −30 = humide.</p>`
  } catch { return '' }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('x-cron-job')
  if (auth !== process.env.CRON_SECRET_ALERT_WEENAT) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!RESEND_KEY) return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })

  const wk = mondayKey()
  // Anti-doublon ROBUSTE par différence de temps (insensible au fuseau, comme le throttle stock).
  // Bloque tout nouvel envoi dans les 6 jours — s'applique MÊME avec ?force=1 pour empêcher tout spam.
  const now = Date.now()
  const WEEK_MS = 6 * 24 * 3600 * 1000
  const { data: state } = await db.from('cron_state').select('last_sent').eq('key', 'weekly_digest').maybeSingle()
  const lastMs = state?.last_sent ? new Date(state.last_sent).getTime() : 0
  if (now - lastMs < WEEK_MS) {
    return NextResponse.json({ skipped: 'déjà envoyé cette semaine', week: wk, last_sent: state?.last_sent })
  }
  // Réserve le créneau AVANT d'envoyer (ferme la fenêtre de course).
  await db.from('cron_state').upsert({ key: 'weekly_digest', last_sent: new Date(now).toISOString() }, { onConflict: 'key' })

  const [{ data: profiles }, { data: tasks }] = await Promise.all([
    db.from('profiles').select('id, full_name, role'),
    db.from('tasks').select('*').eq('week_start', wk),
  ])
  const hydric = await hydricBlock()
  const wkLabel = new Date(wk + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

  const results: any[] = []
  for (const m of (profiles || [])) {
    if (m.role === 'readonly') continue
    const mine = (tasks || []).filter((t: any) =>
      t.status !== 'fait' &&
      (t.assigned_to === m.id || (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(m.id))))

    // Email réel
    let email = ''
    try { const { data: u } = await admin.auth.admin.getUserById(m.id); email = u?.user?.email || '' } catch { /* */ }
    if (!email) { const fn = (m.full_name || '').trim().split(/\s+/)[0].toLowerCase(); if (fn) email = `${fn}@s-o-l.fr` }
    if (!email) { results.push({ name: m.full_name, sent: false, reason: 'no email' }); continue }

    const rows = mine.length
      ? mine.map((t: any) => `<tr><td style="padding:6px 8px;font-size:11px;color:#888">${ROW_LABELS[t.row_key] || t.row_key}</td><td style="padding:6px 8px;font-size:14px">${t.title}${t.status === 'fait' ? ' ✓' : ''}</td></tr>`).join('')
      : `<tr><td colspan="2" style="padding:8px;color:#888;font-size:13px">Aucune tâche assignée cette semaine.</td></tr>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Projet SOL <notifications@s-o-l.fr>',
        to: [email],
        subject: `🗓️ Vos tâches de la semaine du ${wkLabel} — Projet SOL`,
        html: `
          <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
            <h2 style="color:#0f6e56">Bonjour ${(m.full_name || '').split(' ')[0]},</h2>
            <p style="font-size:14px">Voici vos tâches assignées pour la semaine du <strong>${wkLabel}</strong> :</p>
            <table style="border-collapse:collapse;width:100%;background:#fbfaf7;border-radius:8px">${rows}</table>
            ${hydric}
            <a href="${APP_URL}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#0f6e56;color:white;border-radius:8px;text-decoration:none;font-size:14px">Ouvrir le planning →</a>
          </div>`,
      }),
    })
    results.push({ name: m.full_name, to: email, sent: res.ok, tasks: mine.length })
  }

  // (créneau déjà réservé en amont — pas de nouvel upsert ici)
  return NextResponse.json({ week: wk, results })
}
