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

async function sellsyFetch(path: string, options?: RequestInit) {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options?.headers },
  })
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')

  if (type === 'dashboard') {
    // Revenue + invoice stats
    const [invoicesData, companiesData] = await Promise.all([
      sellsyFetch('/invoices?limit=100&order[created]=desc'),
      sellsyFetch('/companies?limit=1'),
    ])
    const invoices = invoicesData.data || []
    const thisMonth = new Date().toISOString().slice(0, 7)
    const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7)

    const monthlyCA = invoices
      .filter((i: {date: string}) => i.date?.startsWith(thisMonth))
      .reduce((s: number, i: {amounts: {total_excl_tax: string}}) => s + parseFloat(i.amounts.total_excl_tax || '0'), 0)

    const unpaid = invoices.filter((i: {amounts: {total_remaining_due_incl_tax: string}}) =>
      parseFloat(i.amounts.total_remaining_due_incl_tax || '0') > 0)

    const totalUnpaid = unpaid.reduce((s: number, i: {amounts: {total_remaining_due_incl_tax: string}}) =>
      s + parseFloat(i.amounts.total_remaining_due_incl_tax || '0'), 0)

    return NextResponse.json({
      monthly_ca: monthlyCA,
      total_clients: companiesData.pagination?.total || 0,
      unpaid_count: unpaid.length,
      unpaid_amount: totalUnpaid,
      recent_invoices: invoices.slice(0, 10).map((i: {
        id: number; number: string; date: string; amounts: {total_excl_tax: string; total_remaining_due_incl_tax: string}
        related: {type: string; id: number}[]
      }) => ({
        id: i.id,
        number: i.number,
        date: i.date,
        total_ht: parseFloat(i.amounts.total_excl_tax || '0'),
        remaining: parseFloat(i.amounts.total_remaining_due_incl_tax || '0'),
        paid: parseFloat(i.amounts.total_remaining_due_incl_tax || '0') === 0,
      })),
    })
  }

  if (type === 'companies') {
    const q = searchParams.get('q') || ''
    const data = await sellsyFetch(`/companies?limit=20${q ? `&search[name]=${encodeURIComponent(q)}` : ''}`)
    return NextResponse.json((data.data || []).map((c: {id: number; name: string; email: string}) => ({
      id: c.id, name: c.name, email: c.email,
    })))
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
    // Create invoice from order data
    const { client_name, lines, order_number } = body
    // Find or create company
    const companies = await sellsyFetch(`/companies?search[name]=${encodeURIComponent(client_name)}&limit=1`)
    const company = companies.data?.[0]
    if (!company) return NextResponse.json({ error: `Client "${client_name}" introuvable dans Sellsy` }, { status: 404 })

    const invoice = await sellsyFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        related: [{ type: 'company', id: company.id }],
        note: `Commande ${order_number} — Projet SOL`,
        rows: lines.map((l: { product: string; quantity: string; unit: string }) => ({
          type: 'product',
          name: `${l.product} (${l.quantity} ${l.unit})`,
          unit_amount: 0,
          quantity: 1,
          discount: 0,
        })),
      }),
    })
    return NextResponse.json({ success: true, invoice_id: invoice.id, invoice_number: invoice.number })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
