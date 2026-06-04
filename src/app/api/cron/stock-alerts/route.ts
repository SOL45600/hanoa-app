import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'benjamin@s-o-l.fr'

const LOW_STOCK_THRESHOLD = parseInt(process.env.STOCK_LOW_THRESHOLD || '5')
const DDM_WARNING_DAYS = parseInt(process.env.STOCK_DDM_DAYS || '90')

export async function GET(request: NextRequest) {
  const auth = request.headers.get('x-cron-job')
  if (auth !== process.env.CRON_SECRET_ALERT_WEENAT) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: lots } = await supabase
    .from('finished_lots')
    .select('lot_number, product_name, format, units_remaining, ddm')
    .gt('units_produced', 0)

  const alerts: string[] = []

  for (const lot of (lots || [])) {
    // Low stock alert
    if (lot.units_remaining <= LOW_STOCK_THRESHOLD && lot.units_remaining > 0) {
      alerts.push(`🔴 Stock bas : <strong>${lot.lot_number}</strong> — ${lot.product_name} ${lot.format} : ${lot.units_remaining} unité(s) restante(s)`)
    }
    // Out of stock
    if (lot.units_remaining === 0) {
      alerts.push(`⬛ Épuisé : <strong>${lot.lot_number}</strong> — ${lot.product_name} ${lot.format}`)
    }
    // DDM warning
    if (lot.ddm && lot.units_remaining > 0) {
      const days = Math.ceil((new Date(lot.ddm).getTime() - Date.now()) / 86400000)
      if (days < DDM_WARNING_DAYS && days > 0) {
        alerts.push(`🟡 DDM proche : <strong>${lot.lot_number}</strong> — ${lot.product_name} ${lot.format} : expire dans ${days} jours (${new Date(lot.ddm).toLocaleDateString('fr-FR')})`)
      }
      if (days <= 0) {
        alerts.push(`🔴 DDM dépassée : <strong>${lot.lot_number}</strong> — ${lot.product_name} ${lot.format}`)
      }
    }
  }

  if (alerts.length === 0 || !RESEND_KEY) {
    return NextResponse.json({ alerts: 0 })
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Projet SOL Stocks <alertes@s-o-l.fr>',
      to: [ALERT_EMAIL],
      subject: `⚠️ ${alerts.length} alerte(s) stock — Projet SOL`,
      html: `
        <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0f6e56">⚠️ Alertes stock — Projet SOL</h2>
          <ul style="padding-left:20px;margin:16px 0">
            ${alerts.map(a => `<li style="margin-bottom:8px">${a}</li>`).join('')}
          </ul>
          <p style="font-size:12px;color:#888">
            Seuil stock bas : ≤ ${LOW_STOCK_THRESHOLD} unités · DDM alerte : ${DDM_WARNING_DAYS} jours<br>
            <a href="https://hanoa-app.vercel.app">Voir le tableau de bord stock →</a>
          </p>
        </div>
      `,
    }),
  })

  return NextResponse.json({ alerts: alerts.length, messages: alerts })
}
