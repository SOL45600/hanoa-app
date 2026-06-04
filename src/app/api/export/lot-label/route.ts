/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCERS: Record<string, string> = {
  CRE: 'Crenier — Lion-en-Sullias', JPH: 'JP Hautin', F3S: 'Ferme des 3 soleils',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées',
  T: 'Noisettes torréfiées',
  P: 'Poudre de noisettes',
  H: 'Huile de noisettes',
}

const SIREN = '939 694 139'
const LEGAL = `SAS HANOA — 1 Le Perrat, 45600 Lion-en-Sullias — SIREN ${SIREN}`

function fmtDate(d?: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(request: NextRequest) {
  const lotNumber = request.nextUrl.searchParams.get('lot')
  if (!lotNumber) return NextResponse.json({ error: 'Lot requis' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: fl } = await admin
    .from('finished_lots')
    .select('*, lots(*, lot_stages(*))')
    .eq('lot_number', lotNumber)
    .single()

  if (!fl) return NextResponse.json({ error: 'Lot introuvable' }, { status: 404 })

  const lot = fl.lots as any
  const traceUrl = `${request.nextUrl.origin}/t/${encodeURIComponent(lotNumber)}`
  const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(traceUrl)}&choe=UTF-8&chld=M|1`
  const logoUrl = `${request.nextUrl.origin}/sol-logo.png`

  const productName = PRODUCTS[fl.product_type] || fl.product_name
  const variety = lot ? (VARIETIES[lot.variety] || lot.variety) : ''
  const origin = lot ? (PRODUCERS[lot.producer_code] || lot.producer_code) : ''
  const parcel = lot?.parcel ? `Parcelle ${lot.parcel}` : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>Étiquette ${lotNumber}</title>
<style>
  @page { size: 75mm 50mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: white; }

  .label {
    width: 75mm; height: 50mm;
    display: flex;
    border: 0.8px solid #000;
    overflow: hidden;
  }

  /* QR side — left 38mm */
  .qr { width: 38mm; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5mm; border-right: 0.5px solid #ddd; background: white; }
  .qr img { width: 33mm; height: 33mm; }
  .qr-hint { font-size: 4.5pt; color: #999; margin-top: 1mm; text-align: center; line-height: 1.3; }

  /* Info side */
  .info { flex: 1; display: flex; flex-direction: column; padding: 1.5mm 2mm; overflow: hidden; }

  /* Logo */
  .logo-row { margin-bottom: 1mm; }
  .logo-row img { height: 6mm; width: auto; display: block; }

  .divider { height: 0.3px; background: #ddd; margin: 1mm 0; }
  .divider-bold { height: 0.8px; background: #000; margin: 1mm 0; }

  .product-name { font-size: 8.5pt; font-weight: 900; color: #000; line-height: 1.2; }
  .product-sub { font-size: 7pt; font-weight: 400; color: #333; margin-top: 0.5mm; }

  .badge {
    display: inline-block; background: #000; color: #fff;
    font-size: 7pt; font-weight: 700; padding: 0.8mm 2mm;
    border-radius: 2px; margin-top: 1mm;
  }

  .details { margin-top: 1.5mm; }
  .detail { font-size: 6.5pt; line-height: 1.7; color: #222; }
  .detail .lbl { color: #999; font-size: 5.5pt; }

  .lot-box {
    border: 0.8px solid #000; border-radius: 1px;
    padding: 0.8mm 1.5mm; margin-top: 1.5mm;
    font-family: Courier, monospace; font-size: 6.5pt; font-weight: 700;
    letter-spacing: 0.02em; color: #000; display: inline-block;
  }

  .ddm-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1mm; }
  .ddm { font-size: 8pt; font-weight: 700; color: #000; }
  .bio { font-size: 6pt; color: #555; }

  .footer { font-size: 4.5pt; color: #aaa; margin-top: 1mm; border-top: 0.3px solid #eee; padding-top: 0.8mm; line-height: 1.4; }

  /* Screen preview */
  @media screen {
    html { background: #f0ede6; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    body { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .label { box-shadow: 0 4px 24px rgba(0,0,0,0.15); transform: scale(2.8); transform-origin: top center; margin: 80px 0 200px 0; }
    .controls { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 100; }
    .btn { padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; font-family: Arial; border: none; }
    .btn-print { background: #0f6e56; color: white; }
    .btn-info { background: white; color: #0f6e56; border: 1px solid #0f6e56; }
  }
  @media print {
    html, body { width: 75mm; height: 50mm; }
    .controls { display: none; }
  }
</style>
</head>
<body>

<div class="controls">
  <button class="btn btn-info" onclick="window.open('${traceUrl}','_blank')">🔗 Page traçabilité</button>
  <button class="btn btn-print" onclick="window.print()">🖨️ Imprimer (Zebra)</button>
</div>

<div class="label">
  <!-- QR CODE -->
  <div class="qr">
    <img src="${qrUrl}" alt="QR traçabilité" />
    <div class="qr-hint">Scanner pour la<br>traçabilité complète</div>
  </div>

  <!-- INFOS -->
  <div class="info">
    <div class="logo-row">
      <img src="${logoUrl}" alt="SOL" />
    </div>
    <div class="divider"></div>
    <div class="product-name">${productName}</div>
    <div class="product-sub">d'origine française — Agriculture Biologique</div>
    <span class="badge">${fl.format}</span>
    <div class="details">
      ${variety ? `<div class="detail"><span class="lbl">Variété </span>${variety}</div>` : ''}
      ${origin ? `<div class="detail"><span class="lbl">Origine </span>${origin}${parcel ? ` · ${parcel}` : ''}</div>` : ''}
      ${lot?.harvest_date ? `<div class="detail"><span class="lbl">Récolte </span>${fmtDate(lot.harvest_date)}</div>` : ''}
    </div>
    <div class="divider-bold"></div>
    <div class="lot-box">${lotNumber}</div>
    <div class="ddm-row">
      <div class="ddm">DDM ${fmtDate(fl.ddm)}</div>
      <div class="bio">FR-BIO-10 ✓</div>
    </div>
    <div class="footer">${LEGAL}</div>
  </div>
</div>

</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
