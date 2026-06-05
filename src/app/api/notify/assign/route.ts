import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_KEY = process.env.RESEND_API_KEY
const APP_URL = 'https://hanoa-app.vercel.app'

export async function POST(req: NextRequest) {
  const { assigneeId, assignerName, taskTitle, weekLabel, rowLabel } = await req.json()

  if (!RESEND_KEY) return NextResponse.json({ sent: 0, reason: 'RESEND_API_KEY manquant' })
  if (!assigneeId) return NextResponse.json({ sent: 0, reason: 'assigneeId manquant' })

  // Resolve the assignee's real email from the profiles table.
  // Anon key (RLS disabled + GRANT ALL) — the service-role key is unreliable in prod.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: assignee } = await db
    .from('profiles').select('email, full_name')
    .eq('id', assigneeId).maybeSingle()

  const targetEmail = assignee?.email
  if (!targetEmail) {
    return NextResponse.json({ sent: 0, reason: 'email assigné introuvable' })
  }

  const res = await fetch('https://api.resend.com/emails', {
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

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend assign error:', res.status, err)
    return NextResponse.json({ sent: 0, error: err }, { status: 502 })
  }
  return NextResponse.json({ sent: 1, to: targetEmail })
}
