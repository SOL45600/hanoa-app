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
    const fiscalStart = `${thisYear}-01-01` // Exercice fiscal depuis 01/01/2026

    // Cursor-based pagination (Sellsy v2 uses cursor, not numeric offset)
    let allInvoices: any[] = []
    let cursor: string | null = null
    const pageSize = 100
    for (let p = 0; p < 5; p++) {
      const url = cursor
        ? `/invoices?limit=${pageSize}&order[date]=desc&offset=${encodeURIComponent(cursor)}`
        : `/invoices?limit=${pageSize}&order[date]=desc`
      const page = await sellsyFetch(url)
      const items: any[] = page.data || []
      if (!items.length) break
      allInvoices = allInvoices.concat(items)
      if (items.length < pageSize) break
      // Stop if oldest invoice is before fiscal year start
      const oldest = items[items.length - 1]?.date || ''
      if (oldest && oldest < fiscalStart) break
      // Get next cursor from pagination
      cursor = page.pagination?.offset || null
      if (!cursor) break
    }

    const [companiesData] = await Promise.all([
      sellsyFetch('/companies?limit=1'),
    ])
    const invoices = allInvoices

    const monthlyCA = invoices
      .filter(i => i.date?.startsWith(thisMonth))
      .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)

    // Fiscal year CA = all invoices since fiscal start
    const fiscalCA = invoices
      .filter(i => i.date >= fiscalStart)
      .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)

    const unpaidAll = invoices.filter(i => parseFloat(i.amounts?.total_remaining_due_incl_tax || '1') > 0)
    const totalUnpaid = unpaidAll.reduce((s, i) => s + parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'), 0)

    // Monthly breakdown: last 12 months
    const monthlyBreakdown: Record<string, number> = {}
    for (let m = 0; m < 12; m++) {
      const d = new Date()
      d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      monthlyBreakdown[key] = invoices
        .filter(i => i.date?.startsWith(key))
        .reduce((s, i) => s + parseFloat(i.amounts?.total_excl_tax || '0'), 0)
    }

    return NextResponse.json({
      monthly_ca: monthlyCA,
      yearly_ca: fiscalCA,
      yearly_year: `${parseInt(thisYear) - 1}–${thisYear}`,
      total_clients: companiesData.pagination?.total || 0,
      unpaid_count: unpaidAll.length,
      unpaid_amount: totalUnpaid,
      unpaid_year_count: unpaidAll.length,
      unpaid_year_amount: totalUnpaid,
      monthly_breakdown: Object.fromEntries(Object.entries(monthlyBreakdown).reverse()),
      recent_invoices: invoices.slice(0, 15).map(i => ({
        id: i.id,
        number: i.number,
        date: i.date,
        total_ht: parseFloat(i.amounts?.total_excl_tax || '0'),
        remaining: parseFloat(i.amounts?.total_remaining_due_incl_tax || '0'),
        paid: parseFloat(i.amounts?.total_remaining_due_incl_tax || '0') === 0,
      })),
      unpaid_invoices: unpaidAll.map(i => ({
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
