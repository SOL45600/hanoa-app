import { NextResponse, type NextRequest } from 'next/server'

const API_KEY = process.env.WEENAT_API_KEY!
const RESEND_KEY = process.env.RESEND_API_KEY!
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'
const BASE = 'https://api.weenat.com/v3'

// Alert thresholds (cbar)
const HPOT_WARN = 300   // Stress modéré
const HPOT_ALERT = 600  // Stress sévère

const TENSIOMETERS = [
  { id: 76945, label: 'Sonde A — Parcelle D', depths: [30, 60] },
  { id: 76946, label: 'Sonde B — Parcelle D', depths: [30, 60] },
  { id: 76943, label: 'Sonde C', depths: [15, 30] },
  { id: 76944, label: 'Sonde D', depths: [15, 30] },
  { id: 76942, label: 'Sonde E', depths: [15, 30] },
  { id: 76939, label: 'Sonde F', depths: [15, 30] },
]

async function getLatestReading(deviceId: number, fields: string) {
  const end = new Date().toISOString().split('.')[0] + 'Z'
  const start = new Date(Date.now() - 2 * 86400000).toISOString().split('.')[0] + 'Z'
  const res = await fetch(
    `${BASE}/data/devices/${deviceId}/?time_step=hour&fields=${fields}&start=${start}&end=${end}`,
    { headers: { Authorization: `Weenat-Api-Key ${API_KEY}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null
}

async function sendAlert(subject: string, html: string) {
  if (!RESEND_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email')
    return
  }
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

// This endpoint is called by Vercel Cron (see vercel.json)
export async function GET(request: NextRequest) {
  // Security: only allow Vercel Cron or internal calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      request.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alerts: string[] = []

  for (const t of TENSIOMETERS) {
    const reading = await getLatestReading(t.id, 'HPOT')
    if (!reading?.HPOT) continue

    const hpotValues = Array.isArray(reading.HPOT) ? reading.HPOT : [reading.HPOT]

    hpotValues.forEach((val: number, i: number) => {
      const depth = t.depths[i]
      if (val >= HPOT_ALERT) {
        alerts.push(`🔴 <strong>${t.label}</strong> — ${depth} cm : ${val} cbar (STRESS SÉVÈRE)`)
      } else if (val >= HPOT_WARN) {
        alerts.push(`🟡 <strong>${t.label}</strong> — ${depth} cm : ${val} cbar (stress modéré)`)
      }
    })
  }

  if (alerts.length > 0) {
    const html = `
      <h2 style="color:#0f6e56">⚠️ Alerte irrigation — Projet SOL</h2>
      <p>Les sondes tensiométriques suivantes dépassent les seuils d'alerte :</p>
      <ul style="margin:12px 0;padding-left:20px">
        ${alerts.map(a => `<li style="margin-bottom:6px">${a}</li>`).join('')}
      </ul>
      <p style="color:#888;font-size:12px">
        Seuils : stress modéré &gt; ${HPOT_WARN} cbar · stress sévère &gt; ${HPOT_ALERT} cbar<br>
        <a href="https://hanoa-app.vercel.app">Ouvrir la plateforme</a>
      </p>
    `
    await sendAlert(`⚠️ ${alerts.length} alerte(s) irrigation — Projet SOL`, html)
  }

  return NextResponse.json({
    checked: TENSIOMETERS.length,
    alerts: alerts.length,
    messages: alerts,
    timestamp: new Date().toISOString(),
  })
}
