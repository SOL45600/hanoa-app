/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées', T: 'Noisettes torréfiées',
  P: 'Poudre de noisettes',   H: 'Huile de noisettes',
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

  const { data: fl } = await db
    .from('finished_lots').select('*')
    .eq('lot_number', lotNumber).maybeSingle()

  if (!fl) return NextResponse.json({ error: 'Lot introuvable', lot: lotNumber }, { status: 404 })

  const { data: lot } = await db
    .from('lots').select('variety, producer_code, parcel, harvest_date')
    .eq('id', fl.parent_lot_id).maybeSingle()

  const origin = request.nextUrl.origin
  // The QR on the package is PUBLIC: it must only expose the regulatory
  // traceability page — never the BDL or the invoice (confidential / personal data).
  const traceUrl = `${origin}/t/${encodeURIComponent(lotNumber)}`
  const qrTarget = traceUrl
  // Generate the QR server-side (Google Image Charts was shut down) — no external call.
  const qrUrl = await QRCode.toDataURL(qrTarget, {
    width: 240, margin: 1, errorCorrectionLevel: 'H',
  })
  const logoUrl = `${origin}/sol-logo.png`

  const variety  = lot?.variety ? VARIETIES[lot.variety] || lot.variety : ''
  const parcel   = lot?.parcel ? `Parcelle ${lot.parcel} — Crenier` : ''
  const product  = PRODUCTS[fl.product_type] || fl.product_name

  // Data rows — only include non-empty
  const rows: [string, string][] = [
    ['Variété',    variety],
    ['Parcelle',   parcel],
    ['Récolte',    lot?.harvest_date ? fmtDate(lot.harvest_date) : ''],
    ['Origine',    'France'],
    ['Label',      'Agriculture Biologique (FR-BIO-10)'],
    ['N° de lot',  lotNumber],
    ['DDM',        fmtDate(fl.ddm)],
    ['Format',     fl.format],
  ].filter(([,v]) => v) as [string, string][]

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Étiquette ${lotNumber}</title>
<style>
/* ── PRINT: 100mm × 60mm ── */
@page { size: 100mm 60mm; margin: 0; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, Helvetica, sans-serif;
  width: 100mm; height: 60mm;
  overflow: hidden;
  background: #fff;
}

/* ── 3-zone layout ── */
.label {
  width: 100mm; height: 60mm;
  display: grid;
  grid-template-rows: 8mm 1fr 14mm;
  border: 0.7px solid #000;
  overflow: hidden;
}

/* ── ZONE 1: HEADER (full width) ── */
.header {
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 0.4px solid #ccc;
  padding: 0 3mm;
}
.header h1 {
  font-size: 10pt;
  font-weight: 900;
  color: #000;
  text-align: center;
  letter-spacing: 0.02em;
}

/* ── ZONE 2: MIDDLE (QR | data) ── */
.middle {
  display: grid;
  grid-template-columns: 42mm 1fr;
  overflow: hidden;
}

.qr-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1mm;
  border-right: 0.4px solid #ccc;
}
.qr-zone img { width: 38mm; height: 38mm; display: block; }

.data-zone {
  padding: 1.5mm 2mm 1mm 2mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 17mm 1fr;
  font-size: 6.5pt;
  line-height: 1.6;
  overflow: hidden;
}
.row .k { color: #888; }
.row .v {
  color: #000;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── ZONE 3: FOOTER ── */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2mm;
  border-top: 0.4px solid #ccc;
  overflow: hidden;
}

.hanoa-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
}
.hanoa-info span {
  font-size: 6pt;
  color: #888;
  line-height: 1.35;
  white-space: nowrap;
}

.sol-logo {
  height: 11mm;
  width: auto;
  display: block;
  flex-shrink: 0;
}

/* ── SCREEN PREVIEW (scaled label, normal-size controls) ── */
@media screen {
  html { background: #e8e4dc; }
  /* Body is NOT transformed, so the fixed controls stay normal size and on top. */
  body { width: auto; height: auto; min-height: 100vh; overflow: visible; display: flex; justify-content: center; align-items: flex-start; padding: 16px; }
  .label { transform: scale(3); transform-origin: top center; margin: 120px 0 460px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
  .controls { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 999; }
  .btn { padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; font-family: Arial; font-weight: 600; border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .btn-print { background: #0f6e56; color: #fff; }
  .btn-trace { background: #fff; color: #0f6e56; border: 1.5px solid #0f6e56; }
}
@media print { .controls { display: none !important; } }
</style>
</head>
<body>

<div class="controls">
  <button class="btn btn-trace" onclick="window.open('${qrTarget}','_blank')">🔗 Traçabilité</button>
  <button class="btn btn-print" onclick="window.print()">🖨️ Imprimer (Zebra)</button>
</div>

<div class="label">

  <!-- ZONE 1: TITRE -->
  <div class="header">
    <h1>${product}</h1>
  </div>

  <!-- ZONE 2: QR + DONNÉES -->
  <div class="middle">
    <div class="qr-zone">
      <img src="${qrUrl}" alt="QR traçabilité" />
    </div>
    <div class="data-zone">
      ${rows.map(([k, v]) => `
      <div class="row">
        <span class="k">${k} :</span>
        <span class="v">${v}</span>
      </div>`).join('')}
    </div>
  </div>

  <!-- ZONE 3: FOOTER -->
  <div class="footer">
    <div class="hanoa-info">
      <span>SAS HANOA</span>
      <span>SIREN : 939 694 139</span>
      <span>1 Le Perrat</span>
      <span>45600</span>
      <span>Lion-en-Sullias</span>
    </div>
    <img class="sol-logo" src="${logoUrl}" alt="SOL"
      onerror="this.style.display='none'" />
  </div>

</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
