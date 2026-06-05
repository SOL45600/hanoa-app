/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées BIO', T: 'Noisettes torréfiées BIO',
  P: 'Poudre de noisettes BIO', H: 'Huile de noisettes BIO',
}

function fmtDate(d?: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// pdf-lib standard fonts only encode WinAnsi — replace common typographic chars
// that would otherwise throw, and drop anything outside the supported range.
function clean(s: string): string {
  return (s || '')
    .replace(/[‐-―]/g, '-')   // dashes
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ€]/g, '')
}

const GREEN = rgb(0.059, 0.431, 0.337)
const DARK = rgb(0.173, 0.173, 0.165)
const GREY = rgb(0.53, 0.53, 0.5)

export async function GET(request: NextRequest) {
  const lotNumber = request.nextUrl.searchParams.get('lot')
  const orderId = request.nextUrl.searchParams.get('order')
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

  const { data: lot } = fl.parent_lot_id
    ? await db.from('lots').select('variety, parcel, harvest_date').eq('id', fl.parent_lot_id).maybeSingle()
    : { data: null as any }

  const variety = lot?.variety ? VARIETIES[lot.variety] || lot.variety : ''
  const parcel = lot?.parcel ? `Parcelle ${lot.parcel} - Crenier` : ''
  const product = PRODUCTS[fl.product_type] || fl.product_name || 'Produit SOL'

  const rows: [string, string][] = ([
    ['Variété', variety],
    ['Parcelle', parcel],
    ['Récolte', lot?.harvest_date ? fmtDate(lot.harvest_date) : ''],
    ['Origine', 'France'],
    ['Label', 'Agriculture Biologique (FR-BIO-10)'],
    ['N° de lot', lotNumber],
    ['DDM', fmtDate(fl.ddm)],
    ['Format', fl.format || ''],
  ] as [string, string][]).filter(([, v]) => v)

  // ── Build the regulatory page (A4 portrait) ──
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const M = 56

  // Header band
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: GREEN })
  page.drawText('Traçabilité produit', { x: M, y: height - 52, size: 20, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Projet SOL - Lion-en-Sullias (45) - Agriculture Biologique', {
    x: M, y: height - 74, size: 10, font, color: rgb(0.85, 0.93, 0.89),
  })

  // Product title
  let y = height - 140
  page.drawText(clean(product), { x: M, y, size: 18, font: fontBold, color: DARK })
  y -= 16
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.7, color: rgb(0.86, 0.84, 0.78) })
  y -= 34

  // Data rows
  for (const [k, v] of rows) {
    page.drawText(clean(k), { x: M, y, size: 11, font, color: GREY })
    page.drawText(clean(v), { x: M + 150, y, size: 11, font: fontBold, color: DARK, maxWidth: width - M - (M + 150) })
    y -= 26
  }

  // BIO box
  y -= 10
  page.drawRectangle({
    x: M, y: y - 44, width: width - 2 * M, height: 52,
    color: rgb(0.91, 0.96, 0.93), borderColor: rgb(0.059, 0.431, 0.337), borderWidth: 0.8,
  })
  page.drawText('Agriculture Biologique certifiée - FR-BIO-10', {
    x: M + 16, y: y - 14, size: 11, font: fontBold, color: GREEN,
  })
  page.drawText('Organisme certificateur : Bureau Veritas / Ecocert', {
    x: M + 16, y: y - 32, size: 9.5, font, color: GREY,
  })

  // SOL logo (optional)
  try {
    const logoBytes = await fetch(`${request.nextUrl.origin}/sol-logo.png`).then(r => r.arrayBuffer())
    const logo = await pdf.embedPng(logoBytes)
    const lw = 90
    const lh = (logo.height / logo.width) * lw
    page.drawImage(logo, { x: width - M - lw, y: 64, width: lw, height: lh })
  } catch { /* logo optional */ }

  // Footer — company info
  const footer = ['SAS HANOA', 'SIREN : 939 694 139', '1 Le Perrat, 45600 Lion-en-Sullias']
  let fy = 96
  for (const line of footer) {
    page.drawText(line, { x: M, y: fy, size: 9, font, color: GREY })
    fy -= 13
  }

  // ── Merge the BDL (page 2+) if the order has one ──
  if (orderId) {
    const { data: att } = await db
      .from('order_attachments').select('storage_path')
      .eq('order_id', orderId).eq('doc_type', 'bon_livraison').maybeSingle()
    if (att?.storage_path) {
      const { data: signed } = await db.storage.from('hanoa-files').createSignedUrl(att.storage_path, 600)
      if (signed?.signedUrl) {
        try {
          const bdlBytes = await fetch(signed.signedUrl).then(r => r.arrayBuffer())
          const bdlDoc = await PDFDocument.load(bdlBytes)
          const copied = await pdf.copyPages(bdlDoc, bdlDoc.getPageIndices())
          copied.forEach(p => pdf.addPage(p))
        } catch { /* BDL not a valid PDF — skip merge */ }
      }
    }
  }

  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="colis-${lotNumber}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
