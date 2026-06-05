/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { sellsyToken, findDeliveryByNumber, findInvoiceForDelivery, fetchSellsyPdf } from '@/lib/sellsy'

// Serves the BDL or the invoice (from Sellsy) for a given order/BDL number,
// as a clean PDF download. Used to assemble the client email attachments.
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')
  const type = req.nextUrl.searchParams.get('type') // 'delivery' | 'invoice'
  if (!order || !type) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

  const token = await sellsyToken()
  if (!token) return NextResponse.json({ error: 'Sellsy indisponible' }, { status: 502 })

  const delivery = await findDeliveryByNumber(token, order)
  if (!delivery) return NextResponse.json({ error: 'BDL introuvable dans Sellsy' }, { status: 404 })

  let pdf: ArrayBuffer | null = null
  let filename = ''
  if (type === 'invoice') {
    const invoice = await findInvoiceForDelivery(token, delivery.id)
    if (!invoice) return NextResponse.json({ error: 'Facture introuvable (BDL pas encore converti ?)' }, { status: 404 })
    pdf = await fetchSellsyPdf(invoice.pdf_link)
    filename = `Facture-${invoice.number || order}.pdf`
  } else {
    pdf = await fetchSellsyPdf(delivery.pdf_link)
    filename = `BDL-${delivery.number || order}.pdf`
  }
  if (!pdf) return NextResponse.json({ error: 'PDF indisponible' }, { status: 502 })

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
