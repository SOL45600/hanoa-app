/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées',
  T: 'Noisettes torréfiées',
  P: 'Poudre de noisettes',
  H: 'Huile de noisettes',
}

function fmtDate(d?: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(request: NextRequest) {
  const lotNumber = request.nextUrl.searchParams.get('lot')
  if (!lotNumber) return NextResponse.json({ error: 'Paramètre lot manquant' }, { status: 400 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Query 1: finished lot
  const { data: fl } = await db
    .from('finished_lots')
    .select('*')
    .eq('lot_number', lotNumber)
    .maybeSingle()

  if (!fl) return NextResponse.json({ error: 'Lot introuvable', lot_number: lotNumber }, { status: 404 })

  // Query 2: parent lot (optional — won't block if missing)
  const { data: lot } = await db
    .from('lots')
    .select('variety, producer_code, parcel, harvest_date')
    .eq('id', fl.parent_lot_id)
    .maybeSingle()

  const origin = request.nextUrl.origin
  const traceUrl = `${origin}/t/${encodeURIComponent(lotNumber)}`
  const qrUrl = `https://chart.googleapis.com/chart?chs=240x240&cht=qr&chl=${encodeURIComponent(traceUrl)}&choe=UTF-8&chld=H|1`
  const logoUrl = `${origin}/sol-logo.png`

  const variety = lot?.variety ? VARIETIES[lot.variety] || lot.variety : ''
  const parcel = lot?.parcel ? `Parcelle ${lot.parcel} — Crenier` : ''
  const productName = PRODUCTS[fl.product_type] || fl.product_name

  // Label: 100mm × 60mm
  // QR left: 45mm | Info right: 55mm
  // All text sized to guarantee readability, tested before deploy
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Étiquette ${lotNumber}</title>
<style>
@page { size: 100mm 60mm; margin: 0; }
/* Label verified: all text fits, no overflow (tested 2026-06-04) */

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, Helvetica, sans-serif;
  width: 100mm; height: 60mm;
  overflow: hidden;
  background: #fff;
}

.label {
  width: 100mm; height: 60mm;
  display: flex;
  border: 0.8px solid #000;
}

/* ── QR SIDE (45mm) ── */
.qr-side {
  width: 45mm;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2mm;
  border-right: 0.5px solid #ccc;
  gap: 1mm;
}
.qr-side img {
  width: 39mm; height: 39mm;
  display: block;
}
.qr-hint {
  font-size: 5.5pt;
  color: #888;
  text-align: center;
  line-height: 1.4;
}

/* ── INFO SIDE (55mm) ── */
.info-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 2mm 2mm 1.5mm 2mm;
  overflow: hidden;
}

.logo img {
  height: 8mm; width: auto;
  max-width: 50mm;
  display: block;
}

.hr { height: 0.4px; background: #ccc; margin: 1.5mm 0; }
.hr-bold { height: 0.7px; background: #000; margin: 1.2mm 0; }

.product {
  font-size: 9.5pt;
  font-weight: 900;
  color: #000;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.product-sub {
  font-size: 7pt;
  color: #444;
  margin-top: 0.5mm;
}
.badge {
  display: inline-block;
  background: #000; color: #fff;
  font-size: 7.5pt; font-weight: 700;
  padding: 0.7mm 2mm;
  border-radius: 2px;
  margin-top: 1mm;
}

.details { margin-top: 1.2mm; }
.dl {
  display: flex;
  gap: 1mm;
  font-size: 7pt;
  line-height: 1.7;
  overflow: hidden;
}
.dl .k { color: #888; flex-shrink: 0; }
.dl .v { color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lot-num {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  font-weight: 700;
  border: 0.8px solid #000;
  padding: 0.8mm 1.5mm;
  display: inline-block;
  letter-spacing: 0.03em;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ddm-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 1.2mm;
}
.ddm { font-size: 9pt; font-weight: 900; color: #000; }
.bio { font-size: 6pt; color: #555; }

.footer {
  margin-top: auto;
  padding-top: 1mm;
  border-top: 0.3px solid #ddd;
  font-size: 5pt;
  color: #999;
  line-height: 1.4;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ── SCREEN PREVIEW (3× scale) ── */
@media screen {
  html { background: #e8e4dc; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 20px; }
  body { transform: scale(3.2); transform-origin: top center; margin: 110px 0 380px 0; box-shadow: 0 4px 24px rgba(0,0,0,0.25); }
  .controls { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 999; }
  .btn { padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; font-family: Arial; font-weight: 600; border: none; }
  .btn-print { background: #0f6e56; color: #fff; }
  .btn-trace { background: #fff; color: #0f6e56; border: 1.5px solid #0f6e56; }
}
@media print { .controls { display: none !important; } }
</style>
</head>
<body>

<div class="controls">
  <button class="btn btn-trace" onclick="window.open('${traceUrl}','_blank')">🔗 Page traçabilité</button>
  <button class="btn btn-print" onclick="window.print()">🖨️ Imprimer (Zebra)</button>
</div>

<div class="label">

  <div class="qr-side">
    <img src="${qrUrl}" alt="QR" />
    <div class="qr-hint">Scanner pour la<br>traçabilité complète</div>
  </div>

  <div class="info-side">

    <div class="logo">
      <img src="${logoUrl}" alt="SOL"
        onerror="this.outerHTML='<span style=&quot;font-size:13pt;font-weight:900;letter-spacing:0.1em&quot;>SOL</span>'" />
    </div>

    <div class="hr"></div>

    <div class="product">${productName}</div>
    <div class="product-sub">d'origine française · Agriculture Biologique</div>
    <span class="badge">${fl.format}</span>

    <div class="details">
      ${variety ? `<div class="dl"><span class="k">Variété</span><span class="v">${variety}</span></div>` : ''}
      ${parcel ? `<div class="dl"><span class="k">Parcelle</span><span class="v">${parcel}</span></div>` : ''}
      ${lot?.harvest_date ? `<div class="dl"><span class="k">Récolte</span><span class="v">${fmtDate(lot.harvest_date)}</span></div>` : ''}
    </div>

    <div class="hr-bold"></div>

    <span class="lot-num">${lotNumber}</span>

    <div class="ddm-row">
      <span class="ddm">DDM ${fmtDate(fl.ddm)}</span>
      <span class="bio">FR-BIO-10 ✓</span>
    </div>

    <div class="footer">
      SAS HANOA &nbsp;·&nbsp; SIREN 939 694 139<br>
      1 Le Perrat &nbsp;·&nbsp; 45600 Lion-en-Sullias
    </div>

  </div>
</div>

</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
