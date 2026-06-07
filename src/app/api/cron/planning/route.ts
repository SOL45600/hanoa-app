/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'

// Calendrier ferti-phyto mutualisé (doit rester aligné avec CalendarView.FERTI_PLAN)
const FERTI_PLAN: { month: number; row: string; title: string }[] = [
  { month: 5, row: 'vergers_ferti_phyto', title: '1er foliaire Zn+B — toutes parcelles (Actiflow Zn680 + Solubor DF)' },
  { month: 5, row: 'vergers_ferti_phyto', title: 'Magprill 500–600 kg/ha — E (pacaniers) puis irriguer' },
  { month: 5, row: 'vergers_ferti_phyto', title: 'Patentkali — D2 (~250) + D1 (~200 kg/ha)' },
  { month: 6, row: 'vergers_ferti_phyto', title: '2e foliaire Zn+B — toutes parcelles + analyses foliaires' },
  { month: 7, row: 'vergers_ferti_phyto', title: 'Appoint Mg foliaire (sels d\'Epsom) si jaunissement — toutes parcelles' },
  { month: 8, row: 'vergers_ferti_phyto', title: 'Apports d\'automne : Phosphore + matière organique — D2 + D1' },
  { month: 8, row: 'vergers_ferti_phyto', title: 'Patentkali 2e moitié + D1 protection gel' },
  { month: 8, row: 'vergers_ferti_phyto', title: 'Magprill 2e passage (selon analyse) — E (pacaniers)' },
]

function mondayOf(date: Date): Date {
  const d = new Date(date); const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); d.setHours(0, 0, 0, 0)
  return d
}
const wkKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET_ALERT_WEENAT
  const ok = request.headers.get('authorization') === `Bearer ${secret}`
    || request.headers.get('x-vercel-cron') === '1'
    || request.headers.get('x-cron-job') === secret
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const today = new Date()
  const thisMonday = wkKey(mondayOf(today))
  const { data: tasks } = await db.from('tasks').select('id, title, row_key, week_start, status')
  const all = tasks || []

  // 1) Report auto : tâches non faites en retard -> semaine en cours
  const overdue = all.filter((t: any) => t.status !== 'fait' && t.week_start < thisMonday)
  for (const t of overdue) {
    await db.from('tasks').update({ week_start: thisMonday, due_date: thisMonday }).eq('id', t.id)
  }

  // 2) Génération du plan ferti-phyto de l'année (idempotent)
  const { data: profs } = await db.from('profiles').select('id').limit(1)
  const createdBy = profs?.[0]?.id || null
  const year = today.getFullYear()
  const toInsert: any[] = []
  for (const item of FERTI_PLAN) {
    const wk = wkKey(mondayOf(new Date(year, item.month, 10)))
    if (!all.some((t: any) => t.row_key === item.row && t.title === item.title && (t.week_start || '').slice(0, 4) === String(year))) {
      toInsert.push({ title: item.title, row_key: item.row, week_start: wk, status: 'a_faire', due_date: wk, assignee_name: 'Toute l\'équipe', created_by: createdBy })
    }
  }
  if (toInsert.length) await db.from('tasks').insert(toInsert)

  // 3) Rappel email début de mois (le 1er, ou forcé via ?alert=1)
  let alertSent = false
  const force = request.nextUrl.searchParams.get('alert') === '1'
  if ((today.getDate() === 1 || force) && RESEND_KEY) {
    const monthItems = FERTI_PLAN.filter(i => i.month === today.getMonth())
    if (monthItems.length) {
      const monthName = today.toLocaleDateString('fr-FR', { month: 'long' })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Projet SOL Alertes <alertes@s-o-l.fr>',
          to: [ALERT_EMAIL],
          subject: `Ferti-phyto — interventions de ${monthName}`,
          html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
            <h2 style="color:#0f6e56">Interventions ferti-phyto — ${monthName} ${year}</h2>
            <ul>${monthItems.map(i => `<li>${i.title}</li>`).join('')}</ul>
            <p style="font-size:13px;color:#888">Retrouvez-les dans le Planning. Tâches non faites reportées automatiquement.</p>
          </div>`,
        }),
      })
      alertSent = res.ok
    }
  }

  return NextResponse.json({ ok: true, carried_over: overdue.length, generated: toInsert.length, alert_sent: alertSent })
}
