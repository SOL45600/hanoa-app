import { NextResponse, type NextRequest } from 'next/server'

const RESEND_KEY = process.env.RESEND_API_KEY
const APP_URL = 'https://hanoa-app.vercel.app'

const USER_EMAILS: Record<string, string> = {
  'benjamin': 'benjamin@s-o-l.fr',
  'nathalie': 'nathalie@s-o-l.fr',
}

// Also accept assigneeId → look up email
const USER_EMAILS_BY_ID: Record<string, { email: string; name: string }> = {}

export async function POST(req: NextRequest) {
  const { assigneeId, assignerName, taskTitle, weekLabel, rowLabel } = await req.json()

  if (!RESEND_KEY) return NextResponse.json({ sent: 0 })

  // Try to find email by ID (simplified — in production fetch from DB)
  // For now, try matching known users
  const knownUsers: Record<string, string> = {
    'benjamin@s-o-l.fr': 'benjamin@s-o-l.fr',
    'nathalie@s-o-l.fr': 'nathalie@s-o-l.fr',
  }

  // We'll send to a fallback if we can't resolve
  const targetEmail = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Projet SOL <notifications@s-o-l.fr>',
      to: [targetEmail],
      subject: `${assignerName} vous a assigné une tâche — ${weekLabel}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:500px;margin:0 auto">
          <h2 style="color:#0f6e56">Nouvelle tâche assignée</h2>
          <p><strong>${assignerName}</strong> vous a assigné une tâche :</p>
          <table style="border-collapse:collapse;margin:16px 0;width:100%">
            <tr><td style="padding:8px;background:#f5f2eb;font-size:12px;color:#888;width:120px">Tâche</td>
                <td style="padding:8px;background:white;font-weight:500">${taskTitle}</td></tr>
            <tr><td style="padding:8px;background:#f5f2eb;font-size:12px;color:#888">Rubrique</td>
                <td style="padding:8px;background:white">${rowLabel}</td></tr>
            <tr><td style="padding:8px;background:#f5f2eb;font-size:12px;color:#888">Semaine</td>
                <td style="padding:8px;background:white">${weekLabel}</td></tr>
          </table>
          <a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#0f6e56;color:white;border-radius:8px;text-decoration:none;font-size:14px">
            Voir mon planning →
          </a>
        </div>
      `,
    }),
  })

  return NextResponse.json({ sent: 1 })
}
