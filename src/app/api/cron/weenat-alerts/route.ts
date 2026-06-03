import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const API_KEY = process.env.WEENAT_API_KEY!
const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'
const BASE = 'https://api.weenat.com/v3'

// Seuils d'alerte tensiométrie (cbar)
// Modifiables ici ou via env vars
const THRESHOLD_WARN  = parseInt(process.env.WEENAT_WARN  || '300')   // stress modéré
const THRESHOLD_ALERT = parseInt(process.env.WEENAT_ALERT || '600')   // stress sévère

// Délai minimum entre deux alertes pour le même capteur/profondeur (heures)
const MIN_HOURS_BETWEEN_ALERTS = parseInt(process.env.WEENAT_COOLDOWN || '8')

const TENSIOMETERS = [
  { id: 76945, label: 'Sonde A — Parcelle D', depths: [30, 60] },
  { id: 76946, label: 'Sonde B — Parcelle D', depths: [30, 60] },
  { id: 76943, label: 'Sonde C', depths: [15, 30] },
  { id: 76944, label: 'Sonde D', depths: [15, 30] },
  { id: 76942, label: 'Sonde E', depths: [15, 30] },
  { id: 76939, label: 'Sonde F', depths: [15, 30] },
]

async function getLatestReading(deviceId: number) {
  const end = new Date().toISOString().split('.')[0] + 'Z'
  const start = new Date(Date.now() - 48 * 3600000).toISOString().split('.')[0] + 'Z'
  const res = await fetch(
    `${BASE}/data/devices/${deviceId}/?time_step=hour&fields=HPOT&start=${start}&end=${end}`,
    { headers: { Authorization: `Weenat-Api-Key ${API_KEY}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null
}

async function sendAlert(subject: string, html: string) {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Projet SOL Alertes <alertes@s-o-l.fr>',
      to: [ALERT_EMAIL],
      subject,
      html,
    }),
  })
}

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-vercel-cron')
  const cronJobHeader = request.headers.get('x-cron-job')
  if (
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    cronHeader !== '1' &&
    cronJobHeader !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Init Supabase for deduplication log
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch recent alerts to avoid duplicates
  const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN_ALERTS * 3600000).toISOString()
  const { data: recentAlerts } = await supabase
    .from('weenat_alerts_log')
    .select('device_id, depth, level')
    .gte('sent_at', cutoff)

  const recentKeys = new Set(
    (recentAlerts || []).map(a => `${a.device_id}-${a.depth}-${a.level}`)
  )

  const newAlerts: { deviceId: number; depth: number; value: number; level: string; label: string }[] = []

  for (const t of TENSIOMETERS) {
    const reading = await getLatestReading(t.id)
    if (!reading?.HPOT) continue

    const hpotValues = Array.isArray(reading.HPOT) ? reading.HPOT : [reading.HPOT]

    hpotValues.forEach((val: number, i: number) => {
      if (typeof val !== 'number') return
      const depth = t.depths[i]

      let level: string | null = null
      if (val >= THRESHOLD_ALERT) level = 'severe'
      else if (val >= THRESHOLD_WARN) level = 'warn'

      if (!level) return

      const key = `${t.id}-${depth}-${level}`
      if (recentKeys.has(key)) return // already alerted recently

      newAlerts.push({ deviceId: t.id, depth, value: val, level, label: t.label })
    })
  }

  if (newAlerts.length === 0) {
    return NextResponse.json({ checked: TENSIOMETERS.length, alerts: 0 })
  }

  // Log alerts
  await supabase.from('weenat_alerts_log').insert(
    newAlerts.map(a => ({
      device_id: a.deviceId,
      depth: a.depth,
      value_cbar: a.value,
      level: a.level,
    }))
  )

  // Send one email with all alerts grouped
  const severeAlerts = newAlerts.filter(a => a.level === 'severe')
  const warnAlerts = newAlerts.filter(a => a.level === 'warn')

  const subject = severeAlerts.length > 0
    ? `🔴 ${severeAlerts.length} alerte(s) CRITIQUE(S) irrigation — Projet SOL`
    : `🟡 ${warnAlerts.length} alerte(s) stress modéré — Projet SOL`

  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto">
      <h2 style="color:#0f6e56">⚠️ Alerte tensiométrie — Projet SOL</h2>
      <p>Les sondes suivantes dépassent les seuils d'alerte :</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f5f2eb;font-size:12px;color:#888">
          <th style="padding:8px;text-align:left">Sonde</th>
          <th style="padding:8px;text-align:left">Profondeur</th>
          <th style="padding:8px;text-align:left">Valeur</th>
          <th style="padding:8px;text-align:left">Niveau</th>
        </tr>
        ${newAlerts.map(a => `
          <tr style="border-bottom:0.5px solid #e5e2db">
            <td style="padding:8px">${a.label}</td>
            <td style="padding:8px">${a.depth} cm</td>
            <td style="padding:8px"><strong>${a.value} cbar</strong></td>
            <td style="padding:8px;color:${a.level === 'severe' ? '#d85a30' : '#ba7517'}">
              ${a.level === 'severe' ? '🔴 Stress sévère' : '🟡 Stress modéré'}
            </td>
          </tr>
        `).join('')}
      </table>
      <p style="font-size:12px;color:#888">
        Seuils configurés : stress modéré &gt; ${THRESHOLD_WARN} cbar · stress sévère &gt; ${THRESHOLD_ALERT} cbar<br>
        Délai entre alertes : ${MIN_HOURS_BETWEEN_ALERTS}h minimum par capteur
      </p>
      <a href="https://hanoa-app.vercel.app" style="display:inline-block;padding:10px 20px;background:#0f6e56;color:white;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">
        Voir le tableau de bord →
      </a>
    </div>
  `

  await sendAlert(subject, html)

  return NextResponse.json({
    checked: TENSIOMETERS.length,
    alerts: newAlerts.length,
    severe: severeAlerts.length,
    warn: warnAlerts.length,
  })
}
