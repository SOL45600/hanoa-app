/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IRRIG_PROGRAMS, isProgramDay, dayKey } from '@/lib/irrigation'

// Lecture Supabase non cachée (sinon la déduplication échoue).
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_DAYS = 500

export async function GET(request: NextRequest) {
  if (request.headers.get('x-cron-job') !== process.env.CRON_SECRET_ALERT_WEENAT) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const backfill = request.nextUrl.searchParams.get('backfill') === '1'

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })

  const earliestStart = IRRIG_PROGRAMS.reduce((min, p) => p.start < min ? p.start : min, '9999-12-31')
  const todayKey = dayKey(new Date())

  // Point de reprise : dernier jour déjà traité (forward-only). Backfill => repart du début.
  const { data: st } = await db.from('cron_state').select('last_sent').eq('key', 'irrigation_gen').maybeSingle()
  const lastKey = (!backfill && st?.last_sent) ? dayKey(new Date(st.last_sent)) : null

  // Jour de départ = lendemain du dernier traité, sinon le 1er passage.
  let startKey = earliestStart
  if (lastKey) {
    const d = new Date(lastKey + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); startKey = dayKey(d)
  }
  if (startKey > todayKey) {
    return NextResponse.json({ ok: true, generated: 0, note: 'à jour', from: startKey, to: todayKey })
  }

  // Relevés déjà présents sur la période (évite tout écrasement du manuel).
  const { data: existing } = await db.from('irrigation_logs')
    .select('date, parcel').gte('date', startKey).lte('date', todayKey)
  const seen = new Set((existing || []).map((r: any) => `${r.date}|${r.parcel}`))

  const toInsert: any[] = []
  const cur = new Date(startKey + 'T00:00:00Z')
  const end = new Date(todayKey + 'T00:00:00Z')
  let guard = 0
  while (cur <= end && guard++ < MAX_DAYS) {
    const key = dayKey(cur)
    for (const prog of IRRIG_PROGRAMS) {
      if (!isProgramDay(prog, key)) continue
      for (const row of prog.rows) {
        if (!seen.has(`${key}|${row.parcel}`)) {
          toInsert.push({ date: key, parcel: row.parcel, m3: row.m3, hours: null, auto: true, created_by: null })
          seen.add(`${key}|${row.parcel}`)
        }
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  if (toInsert.length) {
    const { error } = await db.from('irrigation_logs').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message, hint: 'La colonne "auto" existe-t-elle ? (ALTER TABLE)' }, { status: 400 })
  }

  // Mémorise le dernier jour traité (midi UTC pour éviter les effets de bord de fuseau).
  await db.from('cron_state').upsert(
    { key: 'irrigation_gen', last_sent: todayKey + 'T12:00:00Z' }, { onConflict: 'key' })

  return NextResponse.json({ ok: true, backfill, generated: toInsert.length, from: startKey, to: todayKey })
}
