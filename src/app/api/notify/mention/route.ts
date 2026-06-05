import { NextResponse, type NextRequest } from 'next/server'

const RESEND_KEY = process.env.RESEND_API_KEY
const APP_URL = 'https://hanoa-app.vercel.app'

// Map first names to emails (update when adding users)
const USER_EMAILS: Record<string, string> = {
  'benjamin': 'benjamin@s-o-l.fr',
  'nathalie': 'nathalie@s-o-l.fr',
  'peter': 'peter@s-o-l.fr',
}

export async function POST(req: NextRequest) {
  const { mentions, author, content, sectionId } = await req.json()

  if (!RESEND_KEY) {
    // Not configured yet — silently succeed
    return NextResponse.json({ sent: 0 })
  }

  const sent: string[] = []

  for (const mention of mentions) {
    const email = USER_EMAILS[mention.toLowerCase()]
    if (!email) continue

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Projet SOL <notifications@s-o-l.fr>',
        to: [email],
        subject: `${author} vous a mentionné sur Projet SOL`,
        html: `
          <div style="font-family:Georgia,serif;max-width:500px;margin:0 auto">
            <h2 style="color:#0f6e56">Vous avez été mentionné</h2>
            <p><strong>${author}</strong> vous a mentionné dans un message :</p>
            <blockquote style="border-left:3px solid #0f6e56;padding:10px 16px;background:#f5f2eb;margin:16px 0;border-radius:4px">
              ${content.replace(/\n/g, '<br>')}
            </blockquote>
            <a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#0f6e56;color:white;border-radius:8px;text-decoration:none;font-size:14px">
              Voir sur Projet SOL →
            </a>
            <p style="font-size:12px;color:#888;margin-top:20px">Projet SOL — Plateforme interne</p>
          </div>
        `,
      }),
    })
    sent.push(email)
  }

  return NextResponse.json({ sent: sent.length, emails: sent })
}
