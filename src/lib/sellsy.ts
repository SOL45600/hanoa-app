/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal server-side Sellsy v2 client (client_credentials OAuth2).

const CLIENT_ID = process.env.SELLSY_CLIENT_ID
const CLIENT_SECRET = process.env.SELLSY_CLIENT_SECRET
const BASE = 'https://api.sellsy.com/v2'

let cachedToken: { token: string; expires: number } | null = null

export async function sellsyToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token
  const res = await fetch('https://login.sellsy.com/oauth2/access-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.access_token) return null
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

async function api(token: string, path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  if (!res.ok) return null
  return res.json()
}

export interface SellsyDoc { id: number; number?: string; pdf_link?: string; amounts?: any; parent?: any }

// Find a delivery note (bon de livraison) by its exact number.
export async function findDeliveryByNumber(token: string, number: string): Promise<SellsyDoc | null> {
  const r = await api(token, '/deliveries/search', {
    method: 'POST',
    body: JSON.stringify({ filters: { number } }),
  })
  const hit = (r?.data || []).find((d: any) => d.number === number) || (r?.data || [])[0]
  return hit || null
}

// Find the invoice converted from a given delivery (linked via parent).
export async function findInvoiceForDelivery(token: string, deliveryId: number): Promise<SellsyDoc | null> {
  let cursor: string | null = null
  for (let page = 0; page < 4; page++) {
    const url = cursor
      ? `/invoices?limit=100&offset=${encodeURIComponent(cursor)}`
      : '/invoices?limit=100'
    const r = await api(token, url)
    const items: any[] = r?.data || []
    const match = items.find((i: any) => i?.parent?.type === 'delivery' && i?.parent?.id === deliveryId)
    if (match) return match
    cursor = r?.pagination?.offset || null
    if (items.length < 100 || !cursor) break
  }
  return null
}

// Resolve the client's email for a delivery: company's invoicing contact first,
// then company email, then the delivery's related contact.
export async function getClientEmail(
  token: string,
  delivery: SellsyDoc & { related?: any[]; company_name?: string }
): Promise<{ email?: string; name?: string }> {
  const related: any[] = (delivery as any).related || []
  let name: string | undefined = (delivery as any).company_name
  let email: string | undefined

  const companyRel = related.find(r => r.type === 'company')
  if (companyRel) {
    const company = await api(token, `/companies/${companyRel.id}`)
    if (company) {
      name = company.name || name
      const contactId = company.invoicing_contact_id || company.main_contact_id
      if (contactId) {
        const contact = await api(token, `/contacts/${contactId}`)
        if (contact?.email) email = contact.email
      }
      if (!email && company.email) email = company.email
    }
  }
  if (!email) {
    const contactRel = related.find(r => r.type === 'contact')
    if (contactRel) {
      const contact = await api(token, `/contacts/${contactRel.id}`)
      if (contact?.email) email = contact.email
    }
  }
  return { email, name }
}

// Download a Sellsy document PDF (pdf_link is self-authenticated).
export async function fetchSellsyPdf(pdfLink?: string): Promise<ArrayBuffer | null> {
  if (!pdfLink) return null
  const res = await fetch(pdfLink)
  if (!res.ok) return null
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('pdf')) return null
  return res.arrayBuffer()
}
