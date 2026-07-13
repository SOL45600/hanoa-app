/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FERTI_PLAN } from '@/lib/fertiPlan'

// Évite la mise en cache des lectures Supabase (sinon le throttle mensuel est défait).
export const dynamic = 'force-dynamic'
export const revalidate = 0

const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'

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
  const curMonth = today.getMonth()
  for (const item of FERTI_PLAN) {
    if (item.month < curMonth) continue // ne pas (re)générer les mois passés
    const wk = wkKey(mondayOf(new Date(year, item.month, 10)))
    if (!all.some((t: any) => t.row_key === item.row && t.title === item.title && (t.week_start || '').slice(0, 4) === String(year))) {
      toInsert.push({ title: item.title, row_key: item.row, week_start: wk, status: 'a_faire', due_date: wk, assignee_name: 'Toute l\'équipe', created_by: createdBy })
    }
  }
  if (toInsert.length) await db.from('tasks').insert(toInsert)

  // 3) Rappel email début de mois — MAX 1 par mois (anti-bombardement), ou forcé via ?alert=1
  let alertSent = false
  const force = request.nextUrl.searchParams.get('alert') === '1'
  const monthTag = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`
  // Verrou mensuel STRICT : s'applique toujours, même avec ?alert=1 (anti-spam).
  let alreadySentThisMonth = false
  const { data: st } = await db.from('cron_state').select('last_sent').eq('key', 'planning_digest').maybeSingle()
  if (st?.last_sent) {
    const d = new Date(st.last_sent)
    alreadySentThisMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthTag
  }
  if ((today.getDate() === 1 || force) && !alreadySentThisMonth && RESEND_KEY) {
    const monthItems = FERTI_PLAN.filter(i => i.month === today.getMonth())
    if (monthItems.length) {
      const monthName = today.toLocaleDateString('fr-FR', { month: 'long' })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Projet SOL Alertes <alertes@s-o-l.fr>',
          to: [ALERT_EMAIL],
          subject: `Vergers — interventions de ${monthName}`,
          html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
            <h2 style="color:#0f6e56">Interventions du verger — ${monthName} ${year}</h2>
            <ul>${monthItems.map(i => `<li>${i.title}</li>`).join('')}</ul>
            <p style="font-size:13px;color:#888">Retrouvez-les dans le Planning. Tâches non faites reportées automatiquement.</p>
          </div>`,
        }),
      })
      alertSent = res.ok
      if (res.ok) {
        await db.from('cron_state').upsert(
          { key: 'planning_digest', last_sent: new Date().toISOString() }, { onConflict: 'key' })
      }
    }
  }

  return NextResponse.json({ ok: true, carried_over: overdue.length, generated: toInsert.length, alert_sent: alertSent })
}
