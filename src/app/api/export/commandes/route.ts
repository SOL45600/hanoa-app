/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function csvCell(value: any): string {
  const str = String(value ?? '').replace(/"/g, '""')
  return `"${str}"`
}

export async function GET() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: orders } = await admin
    .from('orders')
    .select('*, order_lines(*)')
    .eq('status', 'livre')
    .order('ship_date', { ascending: false })

  const headers = [
    'N° Commande', 'Client', 'Destination', 'Transporteur',
    'Date expédition', 'N° suivi colis', 'N° lot', 'Produits',
    'Quantité totale', 'Notes', 'Date création'
  ]

  const rows = (orders || []).map((o: any) => {
    const lines = (o.order_lines || [])
      .map((l: any) => [l.product, l.variety, l.quantity, l.unit, l.packaging]
        .filter(Boolean).join(' '))
      .join(' | ')

    const totalQty = (o.order_lines || [])
      .reduce((s: number, l: any) => s + (parseFloat(l.quantity) || 0), 0)

    return [
      o.order_number,
      o.client,
      o.destination || '',
      o.carrier || '',
      o.ship_date || '',
      o.tracking_number || '',
      o.lot_number || '',
      lines,
      totalQty > 0 ? `${totalQty} kg` : '',
      o.notes || '',
      o.created_at?.slice(0, 10) || '',
    ]
  })

  // BOM UTF-8 for proper accents in Excel
  const BOM = '﻿'
  const csv = BOM + [
    headers.map(csvCell).join(';'),
    ...rows.map(r => r.map(csvCell).join(';'))
  ].join('\r\n')

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="commandes-livrees-${date}.csv"`,
    },
  })
}
