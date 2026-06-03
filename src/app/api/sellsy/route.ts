/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server'

const CLIENT_ID = process.env.SELLSY_CLIENT_ID!
const CLIENT_SECRET = process.env.SELLSY_CLIENT_SECRET!
const BASE = 'https://api.sellsy.com/v2'

let cachedToken: { token: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token
  const res = await fetch('https://login.sellsy.com/oauth2/access-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  const data = await res.json()
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

async function sellsyFetch(path: string, options?: RequestInit): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')

  if (type === 'dashboard') {
    const thisYear = new Date().getFullYear().toString()
    const thisMonth = new Date().toISOString().slice(0, 7)

    // Fetch enough invoices to cover the full year (up to 200)
    const [invoicesData, companiesData] = await Promise.all([
      sellsyFetch(`/invoices?limit=200&order[created]=desc&date[after]=${thisYear}-01-01`),
      sellsyFetch('/companies?limit=1'),
    ])
    const invoices: any[] = invoicesData.data || []

    const monthlyCA = invoices
      .filter(i => i.date?.startsWith(thisMonth))
      .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)

    const yearlyCA = invoices
      .filter(i => i.date?.startsWith(thisYear))
      .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)

    const unpaidAll = invoices.filter(i => parseFloat(i.amounts?.total_remaining_due_incl_tax || '1') > 0)
    const unpaidYear = unpaidAll.filter(i => i.date?.startsWith(thisYear))
    const totalUnpaid = unpaidAll.reduce((s, i) => s + parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'), 0)
    const totalUnpaidYear = unpaidYear.reduce((s, i) => s + parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'), 0)

    // Monthly breakdown for current year
    const monthlyBreakdown: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      const key = `${thisYear}-${String(m).padStart(2, '0')}`
      monthlyBreakdown[key] = invoices
        .filter(i => i.date?.startsWith(key))
        .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)
    }

    return NextResponse.json({
      monthly_ca: monthlyCA,
      yearly_ca: yearlyCA,
      yearly_year: thisYear,
      total_clients: companiesData.pagination?.total || 0,
      unpaid_count: unpaidAll.length,
      unpaid_amount: totalUnpaid,
      unpaid_year_count: unpaidYear.length,
      unpaid_year_amount: totalUnpaidYear,
      monthly_breakdown: monthlyBreakdown,
      recent_invoices: invoices.slice(0, 15).map(i => ({
        id: i.id,
        number: i.number,
        date: i.date,
        total_ht: parseFloat(i.amounts?.total_excl_tax || '0'),
        remaining: parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'),
        paid: parseFloat(i.amounts?.total_remaining_due_incl_tax || '0') === 0,
      })),
      unpaid_invoices: unpaidYear.map(i => ({
        id: i.id,
        number: i.number,
        date: i.date,
        total_ht: parseFloat(i.amounts?.total_excl_tax || '0'),
        remaining: parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'),
      })),
    })
  }

  if (type === 'companies') {
    const q = searchParams.get('q') || ''
    const data = await sellsyFetch(`/companies?limit=20${q ? `&search[name]=${encodeURIComponent(q)}` : ''}`)
    return NextResponse.json((data.data || []).map((c: any) => ({ id: c.id, name: c.name, email: c.email })))
  }

  if (type === 'invoices') {
    const data = await sellsyFetch('/invoices?limit=50&order[created]=desc')
    return NextResponse.json(data.data || [])
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { type } = body

  if (type === 'create_invoice') {
    const { client_name, lines, order_number } = body

    // Check if invoice already exists for this order
    const existing = await sellsyFetch(`/invoices?order_reference=${encodeURIComponent(order_number)}&limit=1`)
    if (existing.data?.length > 0) {
      const inv = existing.data[0]
      return NextResponse.json({
        success: true, already_exists: true,
        invoice_id: inv.id, invoice_number: inv.number,
        pdf_link: inv.pdf_link,
        paid: parseFloat(inv.amounts?.total_remaining_due_incl_tax || '1') === 0,
      })
    }

    const companies = await sellsyFetch(`/companies?search[name]=${encodeURIComponent(client_name)}&limit=1`)
    const company = companies.data?.[0]
    if (!company) return NextResponse.json({ error: `Client "${client_name}" introuvable dans Sellsy` }, { status: 404 })

    const invoice = await sellsyFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        related: [{ type: 'company', id: company.id }],
        order_reference: order_number,
        subject: `Commande ${order_number} — Projet SOL`,
        note: (lines || []).map((l: any) => `${l.product} ${l.quantity} ${l.unit}`).join('\n'),
        rows: (lines || []).map((l: any) => ({
          type: 'product',
          name: [l.product, l.variety, l.packaging].filter(Boolean).join(' — '),
          unit_amount: 0,
          quantity: parseFloat(l.quantity) || 1,
          discount: 0,
        })),
      }),
    })
    return NextResponse.json({
      success: true, already_exists: false,
      invoice_id: invoice.id, invoice_number: invoice.number,
      pdf_link: invoice.pdf_link,
    })
  }

  if (type === 'check_invoice') {
    const { order_number } = body
    const data = await sellsyFetch(`/invoices?order_reference=${encodeURIComponent(order_number)}&limit=1`)
    const inv = data.data?.[0]
    if (!inv) return NextResponse.json({ found: false })
    return NextResponse.json({
      found: true,
      invoice_number: inv.number,
      pdf_link: inv.pdf_link,
      paid: parseFloat(inv.amounts?.total_remaining_due_incl_tax || '1') === 0,
      remaining: parseFloat(inv.amounts?.total_remaining_due_incl_tax || '0'),
    })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
