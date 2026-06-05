import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VARIETIES: Record<string, string> = { PAU:'Pauetet', COR:'Corabel', TON:'Tonda', SEG:'Segorbe', LEW:'Lewis' }
const PRODUCERS: Record<string, string> = { CRE:'Crenier (SOL)', JPH:'JP Hautin', F3S:'Ferme des 3 soleils' }
const STAGES: Record<string, string> = {
  lavage:'Lavage', sechage:'Séchage', calibrage:'Calibrage',
  cassage:'Décorticage', torreflaction:'Torréfaction', presse:'Presse huile', broyage:'Broyage poudre',
}

function fmtDate(d?: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR')
}

export async function GET() {
  // Anon key (RLS disabled + GRANT ALL) — the service-role key is unreliable in prod.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: lots } = await admin
    .from('lots')
    .select('*, lot_stages(*), lot_calibration(*), finished_lots(*)')
    .order('harvest_date', { ascending: false })

  const year = new Date().getFullYear()

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Registre BIO ${year} — Projet SOL</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
  h1 { font-size: 16px; color: #0f6e56; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #666; margin-bottom: 20px; }
  .lot-section { margin-bottom: 24px; page-break-inside: avoid; }
  .lot-header { background: #0f6e56; color: white; padding: 8px 12px; font-weight: bold; font-size: 13px; border-radius: 6px 6px 0 0; }
  .lot-body { border: 1px solid #ccc; border-top: none; border-radius: 0 0 6px 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f2eb; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0ede6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .label { color: #888; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .info-cell { padding: 6px 8px; border-right: 1px solid #f0ede6; border-bottom: 1px solid #f0ede6; }
  .info-cell:nth-child(3n) { border-right: none; }
  .info-label { font-size: 9px; text-transform: uppercase; color: #aaa; display: block; }
  .info-value { font-size: 11px; font-weight: 500; }
  .stage-list { padding: 8px; }
  .stage-row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #f0ede6; font-size: 10px; }
  .stage-row:last-child { border-bottom: none; }
  .finished-row { background: #e8f5ee; padding: 6px 8px; font-size: 10px; border-top: 1px solid #ccc; }
  .section-title { font-size: 10px; text-transform: uppercase; color: #888; padding: 5px 8px; background: #fafaf8; border-bottom: 1px solid #f0ede6; }
  .bio-footer { text-align: center; padding: 16px; border: 2px solid #0f6e56; border-radius: 8px; margin-top: 20px; }
  @media print { .lot-section { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>Registre de traçabilité BIO — Noisettes</h1>
<div class="subtitle">
  Projet SOL · Lion-en-Sullias (45) · FR-BIO-10<br>
  Exercice ${year} · Généré le ${new Date().toLocaleDateString('fr-FR')} · À conserver 5 ans
</div>

${(lots || []).map((lot: any) => {
  const stages = (lot.lot_stages || []).sort((a: any, b: any) => a.stage_date.localeCompare(b.stage_date))
  const calibTotal = (lot.lot_calibration || []).reduce((s: number, c: any) => s + c.weight_kg, 0)
  return `
<div class="lot-section">
  <div class="lot-header">${lot.lot_number} — ${VARIETIES[lot.variety] || lot.variety} · ${PRODUCERS[lot.producer_code] || lot.producer_code}${lot.parcel ? ` · Parcelle ${lot.parcel}` : ''}</div>
  <div class="lot-body">
    <div class="info-grid">
      <div class="info-cell"><span class="info-label">Date récolte</span><span class="info-value">${fmtDate(lot.harvest_date)}</span></div>
      <div class="info-cell"><span class="info-label">Date réception</span><span class="info-value">${fmtDate(lot.reception_date)}</span></div>
      <div class="info-cell"><span class="info-label">Humidité réception</span><span class="info-value">${lot.humidity_pct ? lot.humidity_pct + '%' : '–'}</span></div>
    </div>

    ${stages.length > 0 ? `
    <div class="section-title">Étapes de transformation</div>
    <div class="stage-list">
      ${stages.map((s: any) => `
      <div class="stage-row">
        <strong>${STAGES[s.stage_type] || s.stage_type}</strong>
        <span>${fmtDate(s.stage_date)}</span>
        ${s.operator ? `<span>· ${s.operator}</span>` : ''}
        ${s.weight_in_kg ? `<span>· Entrée: ${s.weight_in_kg}kg</span>` : ''}
        ${s.weight_out_kg ? `<span>· Sortie: ${s.weight_out_kg}kg</span>` : ''}
        ${s.humidity_pct_out ? `<span>· Hum: ${s.humidity_pct_out}%</span>` : ''}
        ${s.quality_score ? `<span>· Qualité: ${'★'.repeat(s.quality_score)}</span>` : ''}
        ${s.temperature_c ? `<span>· ${s.temperature_c}°C</span>` : ''}
        ${s.duration_min ? `<span>· ${s.duration_min}min</span>` : ''}
        ${(s as any).volume_out_l ? `<span>· ${(s as any).volume_out_l}L huile</span>` : ''}
        ${s.notes ? `<span>· ${s.notes}</span>` : ''}
      </div>`).join('')}
    </div>` : ''}

    ${calibTotal > 0 ? `
    <div class="section-title">Calibrage — Total ${calibTotal} kg</div>
    <table>
      ${(lot.lot_calibration || []).map((c: any) =>
        `<tr><td>${c.caliber}</td><td>${c.weight_kg} kg</td><td>${((c.weight_kg/calibTotal)*100).toFixed(0)}%</td></tr>`
      ).join('')}
    </table>` : ''}

    ${(lot.finished_lots || []).map((fl: any) => `
    <div class="finished-row">
      <strong>✓ PRODUIT FINI</strong> — ${fl.lot_number} · ${fl.product_name} · ${fl.format} · ${fl.units_produced} unités
      · Production : ${fmtDate(fl.production_date)} · DDM : ${fmtDate(fl.ddm)}
    </div>`).join('')}

    ${lot.notes ? `<div style="padding:6px 8px;font-size:10px;color:#666;border-top:1px solid #f0ede6">Notes : ${lot.notes}</div>` : ''}
  </div>
</div>`
}).join('')}

<div class="bio-footer">
  <strong>✓ Agriculture Biologique certifiée — FR-BIO-10</strong><br>
  Ce registre est conforme aux exigences du Règlement EU 2018/848<br>
  Documents à conserver 5 ans minimum
</div>

<script>window.onload = () => window.print()</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="registre-bio-${year}.html"`,
    },
  })
}
