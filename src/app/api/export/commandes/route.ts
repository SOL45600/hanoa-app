/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function escapeXml(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cell(value: any, type = 'String'): string {
  const v = escapeXml(String(value ?? ''))
  if (type === 'Number') return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
  return `<Cell><Data ss:Type="String">${v}</Data></Cell>`
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

  const rows = (orders || []).map((o: any) => {
    const lines = (o.order_lines || [])
      .map((l: any) => `${l.product}${l.variety ? ' ' + l.variety : ''} — ${l.quantity} ${l.unit}${l.packaging ? ' (' + l.packaging + ')' : ''}`)
      .join(' | ')
    return {
      order_number: o.order_number,
      client: o.client,
      destination: o.destination || '',
      carrier: o.carrier || '',
      ship_date: o.ship_date || '',
      tracking: o.tracking_number || '',
      lot_number: o.lot_number || '',
      products: lines,
      notes: o.notes || '',
      created_at: o.created_at?.slice(0, 10) || '',
    }
  })

  const headers = [
    'N° Commande', 'Client', 'Destination', 'Transporteur',
    'Date expédition', 'N° suivi colis', 'N° lot', 'Produits', 'Notes', 'Date création'
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F6E56" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="14" ss:Color="#0F6E56"/>
    </Style>
    <Style ss:ID="row_even">
      <Interior ss:Color="#E1F5EE" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Commandes livrées">
    <Table>
      <Column ss:Width="80"/>
      <Column ss:Width="150"/>
      <Column ss:Width="120"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="140"/>
      <Column ss:Width="100"/>
      <Column ss:Width="300"/>
      <Column ss:Width="150"/>
      <Column ss:Width="100"/>

      <Row>
        <Cell ss:MergeAcross="9"><Data ss:Type="String">COMMANDES LIVRÉES — Projet SOL · Exporté le ${new Date().toLocaleDateString('fr-FR')}</Data></Cell>
      </Row>
      <Row/>
      <Row>
        ${headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${h}</Data></Cell>`).join('\n        ')}
      </Row>
      ${rows.map((r, i) => `
      <Row ${i % 2 === 1 ? 'ss:StyleID="row_even"' : ''}>
        ${cell(r.order_number)}
        ${cell(r.client)}
        ${cell(r.destination)}
        ${cell(r.carrier)}
        ${cell(r.ship_date)}
        ${cell(r.tracking)}
        ${cell(r.lot_number)}
        ${cell(r.products)}
        ${cell(r.notes)}
        ${cell(r.created_at)}
      </Row>`).join('')}
      <Row/>
      <Row>
        <Cell><Data ss:Type="String">Total commandes livrées :</Data></Cell>
        <Cell><Data ss:Type="Number">${rows.length}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="commandes-livrees-${date}.xls"`,
    },
  })
}
