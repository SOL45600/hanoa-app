import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet', COR: 'Corabel', TON: 'Tonda', SEG: 'Segorbe', LEW: 'Lewis',
}
const PRODUCERS: Record<string, string> = {
  CRE: 'Ferme Crenier — SOL', JPH: 'JP Hautin', F3S: 'Ferme des 3 soleils',
}
const STAGES: Record<string, string> = {
  lavage: 'Lavage', sechage: 'Séchage', calibrage: 'Calibrage',
  cassage: 'Décorticage', torreflaction: 'Torréfaction', presse: 'Pressage huile', broyage: 'Broyage poudre',
}
const PRODUCTS: Record<string, string> = {
  D: 'Noisettes décortiquées BIO', T: 'Noisettes torréfiées BIO',
  P: 'Poudre de noisettes BIO', H: 'Huile de noisettes BIO',
}

function fmtDate(d?: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function TraceabilityPage({ params }: { params: { lot: string } }) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Find finished lot by lot_number
  const { data: fl } = await admin
    .from('finished_lots')
    .select('*, lots(*, lot_stages(*), lot_calibration(*))')
    .eq('lot_number', params.lot)
    .single()

  if (!fl) notFound()

  const lot = fl.lots as any
  const stages = (lot?.lot_stages || []).sort((a: any, b: any) => a.stage_date.localeCompare(b.stage_date))
  const calibration = lot?.lot_calibration || []
  const calibTotal = calibration.reduce((s: number, c: any) => s + c.weight_kg, 0)

  // ── Bon(s) de livraison liés à ce lot (page 2 du QR colis) ──
  const orderIds = new Set<string>()
  const { data: linksA } = await admin.from('order_lines').select('order_id').eq('finished_lot_id', fl.id)
  linksA?.forEach((l: any) => l.order_id && orderIds.add(l.order_id))
  if (fl.lot_number) {
    const { data: linksB } = await admin.from('order_lines').select('order_id').eq('lot_number', fl.lot_number)
    linksB?.forEach((l: any) => l.order_id && orderIds.add(l.order_id))
    const { data: ordsC } = await admin.from('orders').select('id').eq('lot_number', fl.lot_number)
    ordsC?.forEach((o: any) => o.id && orderIds.add(o.id))
  }

  type Bdl = { url: string; name: string; orderNumber: string; client: string; shipDate?: string }
  const bdls: Bdl[] = []
  if (orderIds.size) {
    const ids = Array.from(orderIds)
    const [{ data: atts }, { data: ords }] = await Promise.all([
      admin.from('order_attachments').select('order_id, name, storage_path').in('order_id', ids).eq('doc_type', 'bon_livraison'),
      admin.from('orders').select('id, order_number, client, ship_date').in('id', ids),
    ])
    for (const a of (atts || []) as any[]) {
      const { data: signed } = await admin.storage.from('hanoa-files').createSignedUrl(a.storage_path, 60 * 60 * 24 * 7)
      if (!signed?.signedUrl) continue
      const o = (ords || []).find((x: any) => x.id === a.order_id) as any
      bdls.push({ url: signed.signedUrl, name: a.name, orderNumber: o?.order_number || '', client: o?.client || '', shipDate: o?.ship_date })
    }
  }

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fl.lot_number} — Traçabilité Projet SOL</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Georgia, serif; background: #f5f2eb; color: #2c2c2a; }
          .header { background: #0f6e56; color: white; padding: 24px 20px; text-align: center; }
          .header h1 { font-size: 22px; margin-bottom: 4px; }
          .header p { font-size: 13px; opacity: 0.8; }
          .badge { display: inline-block; background: rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 14px; font-size: 13px; margin-top: 10px; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .card { background: white; border-radius: 12px; padding: 18px; margin-bottom: 14px; border: 0.5px solid #e5e2db; }
          .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 12px; font-family: sans-serif; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 0.5px solid #f0ede6; font-size: 14px; }
          .row:last-child { border-bottom: none; }
          .row label { color: #888; }
          .row value { font-weight: 500; }
          .stage { display: flex; gap: 12px; padding: 8px 0; border-bottom: 0.5px solid #f0ede6; font-size: 13px; }
          .stage:last-child { border-bottom: none; }
          .stage-dot { width: 10px; height: 10px; border-radius: 50%; background: #0f6e56; flex-shrink: 0; margin-top: 4px; }
          .calib { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 13px; }
          .calib-bar { flex: 1; height: 14px; background: #f0ede6; border-radius: 7px; overflow: hidden; }
          .calib-fill { height: 100%; background: #0f6e56; border-radius: 7px; }
          .bio { background: #e8f5ee; border: 1px solid #0f6e5644; border-radius: 8px; padding: 12px 16px; text-align: center; font-size: 13px; color: #0f6e56; margin-top: 14px; }
          .bdl-link { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; background: #fbf6ec; border: 1px solid #ba751733; border-radius: 8px; margin-bottom: 8px; text-decoration: none; color: #2c2c2a; }
          .bdl-link:last-child { margin-bottom: 0; }
          .bdl-link .meta { font-size: 12px; color: #888; }
          .bdl-link .dl { font-size: 13px; color: #ba7517; font-weight: 600; white-space: nowrap; }
          .footer { text-align: center; font-size: 12px; color: #aaa; padding: 20px; }
        `}</style>
      </head>
      <body>
        <div className="header">
          <h1>🌰 Traçabilité Noisettes</h1>
          <p>Projet SOL · Lion-en-Sullias, Loiret · Agriculture Biologique</p>
          <div className="badge">{fl.lot_number}</div>
        </div>

        <div className="container">
          {/* Produit fini */}
          <div className="card">
            <h2>Produit fini</h2>
            <div className="row"><label>Désignation</label><span>{PRODUCTS[fl.product_type] || fl.product_name}</span></div>
            <div className="row"><label>Format</label><span>{fl.format}</span></div>
            <div className="row"><label>Date de production</label><span>{fmtDate(fl.production_date)}</span></div>
            <div className="row"><label>Date de durabilité min.</label><span>{fmtDate(fl.ddm)}</span></div>
            <div className="row"><label>N° de lot</label><span style={{fontFamily:'monospace', color:'#0f6e56'}}>{fl.lot_number}</span></div>
          </div>

          {/* Origine */}
          {lot && (
            <div className="card">
              <h2>Origine</h2>
              <div className="row"><label>Producteur</label><span>{PRODUCERS[lot.producer_code] || lot.producer_code}</span></div>
              {lot.parcel && <div className="row"><label>Parcelle</label><span>{lot.parcel}</span></div>}
              <div className="row"><label>Variété</label><span>{VARIETIES[lot.variety] || lot.variety}</span></div>
              <div className="row"><label>Date de récolte</label><span>{fmtDate(lot.harvest_date)}</span></div>
              {lot.humidity_pct && <div className="row"><label>Humidité réception</label><span>{lot.humidity_pct}%</span></div>}
            </div>
          )}

          {/* Calibrage */}
          {calibTotal > 0 && (
            <div className="card">
              <h2>Calibrage — {calibTotal} kg total</h2>
              {calibration.map((c: any) => (
                <div key={c.id} className="calib">
                  <span style={{width:70, fontFamily:'monospace', fontSize:12}}>{c.caliber}</span>
                  <div className="calib-bar">
                    <div className="calib-fill" style={{width:`${(c.weight_kg/calibTotal)*100}%`}} />
                  </div>
                  <span>{c.weight_kg} kg · {((c.weight_kg/calibTotal)*100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Étapes de transformation */}
          {stages.length > 0 && (
            <div className="card">
              <h2>Étapes de transformation</h2>
              {stages.map((s: any) => (
                <div key={s.id} className="stage">
                  <div className="stage-dot" />
                  <div>
                    <strong>{STAGES[s.stage_type] || s.stage_type}</strong> — {fmtDate(s.stage_date)}
                    {s.weight_out_kg && ` · Sortie : ${s.weight_out_kg} kg`}
                    {s.humidity_pct_out && ` · Hum. : ${s.humidity_pct_out}%`}
                    {s.quality_score && ` · Qualité : ${'★'.repeat(s.quality_score)}`}
                    {s.temperature_c && ` · ${s.temperature_c}°C`}
                    {(s as any).volume_out_l && ` · ${(s as any).volume_out_l} L huile`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bon(s) de livraison */}
          {bdls.length > 0 && (
            <div className="card">
              <h2>Bon de livraison</h2>
              {bdls.map((b, i) => (
                <a key={i} className="bdl-link" href={b.url} target="_blank" rel="noopener noreferrer">
                  <span>
                    📄 {b.orderNumber ? `Commande #${b.orderNumber}` : b.name}
                    {(b.client || b.shipDate) && (
                      <span className="meta"><br/>{b.client}{b.shipDate ? ` · expédié le ${fmtDate(b.shipDate)}` : ''}</span>
                    )}
                  </span>
                  <span className="dl">Télécharger →</span>
                </a>
              ))}
            </div>
          )}

          <div className="bio">
            ✓ Agriculture Biologique certifiée · FR-BIO-10<br/>
            Organisme certificateur : Bureau Veritas / Ecocert
          </div>
        </div>

        <div className="footer">
          Projet SOL · Lion-en-Sullias (45) · sol45600.fr<br/>
          Page générée automatiquement · Non contractuelle
        </div>
      </body>
    </html>
  )
}
