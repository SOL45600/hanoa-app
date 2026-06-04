/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Generate SVG label — rendered as HTML that the browser prints
// Compatible with Zebra ZD220 62mm × 40mm label (direct print or save as image)

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCERS: Record<string, string> = {
  CRE: 'Crenier — Lion-en-Sullias', JPH: 'JP Hautin', F3S: 'Ferme des 3 soleils',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées', T: 'Noisettes torréfiées',
  P: 'Poudre de noisettes', H: 'Huile de noisettes',
}

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
    .select('*, lots(*)')
    .eq('lot_number', lotNumber)
    .single()

  if (!fl) return NextResponse.json({ error: 'Lot introuvable' }, { status: 404 })

  const lot = fl.lots as any
  const traceUrl = `${request.nextUrl.origin}/t/${encodeURIComponent(lotNumber)}`
  const productLine = `${PRODUCTS[fl.product_type] || fl.product_type} BIO`
  const origin = lot ? `${PRODUCERS[lot.producer_code] || lot.producer_code}${lot.parcel ? ` · Parcelle ${lot.parcel}` : ''}` : ''
  const variety = lot ? VARIETIES[lot.variety] || lot.variety : ''

  // Generate HTML label page — prints at exact Zebra label size
  // Uses QR code via Google Charts API (no server-side lib needed)
  const qrUrl = `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(traceUrl)}&choe=UTF-8`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Étiquette ${lotNumber}</title>
<style>
  @page {
    size: 62mm 40mm;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  body { width: 62mm; height: 40mm; background: white; overflow: hidden; }

  .label {
    width: 62mm; height: 40mm;
    display: flex;
    gap: 0;
    border: 0.5px solid #ddd;
  }

  /* QR code side */
  .qr-side {
    width: 40mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2mm;
    border-right: 0.5px solid #eee;
    background: white;
  }
  .qr-side img { width: 33mm; height: 33mm; }
  .qr-hint { font-size: 5px; color: #aaa; margin-top: 1mm; text-align: center; }

  /* Info side */
  .info-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.5mm 2mm;
    background: white;
  }

  .brand { font-size: 7px; font-weight: 900; color: #0f6e56; letter-spacing: 0.05em; }
  .product { font-size: 7px; font-weight: 700; color: #222; line-height: 1.3; }
  .format-badge {
    display: inline-block;
    background: #0f6e56;
    color: white;
    font-size: 7px;
    font-weight: 700;
    padding: 0.5mm 2mm;
    border-radius: 3px;
    margin-top: 0.5mm;
  }

  .details { margin-top: 1mm; }
  .detail-row { font-size: 5.5px; color: #333; line-height: 1.6; }
  .detail-label { color: #888; font-size: 5px; }

  .lot-number {
    font-size: 6px;
    font-weight: 700;
    font-family: monospace;
    color: #0f6e56;
    background: #e8f5ee;
    padding: 0.8mm 1.5mm;
    border-radius: 2px;
    letter-spacing: 0.02em;
  }

  .ddm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5mm;
  }
  .ddm { font-size: 6px; color: #222; font-weight: 600; }
  .bio { font-size: 5px; color: #0f6e56; font-weight: 700; }

  .footer { font-size: 4.5px; color: #aaa; border-top: 0.3px solid #eee; padding-top: 0.5mm; margin-top: 0.5mm; }

  @media screen {
    body { background: #f0ede6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .label { box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .print-btn {
      position: fixed; top: 20px; right: 20px;
      background: #0f6e56; color: white; border: none; padding: 10px 20px;
      border-radius: 8px; font-size: 14px; cursor: pointer;
    }
    .dl-btn {
      position: fixed; top: 20px; right: 130px;
      background: white; color: #0f6e56; border: 1px solid #0f6e56; padding: 10px 20px;
      border-radius: 8px; font-size: 14px; cursor: pointer;
    }
  }
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
<button class="dl-btn" onclick="
  const c = document.createElement('canvas');
  c.width=234; c.height=151;
  const ctx=c.getContext('2d');
  // Fallback: just print
  window.print()
">💾 Télécharger</button>

<div class="label">
  <!-- QR Code -->
  <div class="qr-side">
    <img src="${qrUrl}" alt="QR Traçabilité" />
    <div class="qr-hint">Scanner pour la traçabilité complète</div>
  </div>

  <!-- Informations -->
  <div class="info-side">
    <div>
      <div class="brand">PROJET SOL</div>
      <div class="product">${productLine}</div>
      <div class="format-badge">${fl.format}</div>
    </div>

    <div class="details">
      ${variety ? `<div class="detail-row"><span class="detail-label">Variété </span>${variety}</div>` : ''}
      ${origin ? `<div class="detail-row"><span class="detail-label">Origine </span>${origin}</div>` : ''}
      ${lot?.harvest_date ? `<div class="detail-row"><span class="detail-label">Récolte </span>${fmtDate(lot.harvest_date)}</div>` : ''}
    </div>

    <div>
      <div class="lot-number">${lotNumber}</div>
      <div class="ddm-row">
        <div class="ddm">DDM ${fmtDate(fl.ddm)}</div>
        <div class="bio">FR-BIO-10 ✓</div>
      </div>
      <div class="footer">Lion-en-Sullias (45) · Agriculture Biologique</div>
    </div>
  </div>
</div>

</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
