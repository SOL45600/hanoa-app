/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'
import { sellsyToken, findDeliveryByNumber, findInvoiceForDelivery, getClientEmail } from '@/lib/sellsy'

// Resolves, for an order/BDL number: the client email (Sellsy invoicing contact),
// the client name, and whether the invoice already exists (BDL converted).
export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order')
  if (!order) return NextResponse.json({ found: false, reason: 'order manquant' }, { status: 400 })

  const token = await sellsyToken()
  if (!token) return NextResponse.json({ found: false, reason: 'Sellsy indisponible' })

  const delivery = await findDeliveryByNumber(token, order)
  if (!delivery) return NextResponse.json({ found: false, reason: 'BDL introuvable dans Sellsy' })

  const { email, name } = await getClientEmail(token, delivery)
  const invoice = await findInvoiceForDelivery(token, delivery.id)

  return NextResponse.json({
    found: true,
    email: email || null,
    clientName: name || null,
    hasInvoice: !!invoice,
  })
}
