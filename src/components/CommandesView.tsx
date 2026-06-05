'use client'
import { useState, useEffect, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import DocPreview from './DocPreview'
import styles from './CommandesView.module.css'

/* ─── TYPES ─────────────────────────────────────────────────── */
interface OrderLine {
  id?: string
  product: string
  variety: string
  quantity: string
  unit: string
  packaging: string
  lot_number: string
  sort_order: number
}

interface OrderAttachment {
  id: string
  order_id: string
  doc_type: string
  name: string
  storage_path: string
  mime_type?: string
  size_bytes?: number
}

interface Order {
  id: string
  order_number: string
  client: string
  destination: string
  carrier: string
  ship_date: string
  tracking_number: string
  lot_number: string
  status: string
  notes: string
  created_by: string
  created_at: string
  lines?: OrderLine[]
  attachments?: OrderAttachment[]
}

const STATUSES: Record<string, { label: string; color: string; bg: string; next: string | null }> = {
  a_preparer: { label: 'À préparer', color: '#ba7517', bg: '#fef3e2', next: 'prepare' },
  prepare:    { label: 'Préparé',    color: '#185fa5', bg: '#e8f4fd', next: 'envoye' },
  envoye:     { label: 'Envoyé',     color: '#0f6e56', bg: '#e8f5ee', next: 'livre' },
  livre:      { label: 'Livré',      color: '#888',    bg: '#f0ede6', next: null },
}

const STATUS_ORDER = ['a_preparer', 'prepare', 'envoye', 'livre']

const DOC_TYPES = [
  { key: 'bon_livraison',     label: 'Bon de livraison',              icon: 'ti-file-text' },
  { key: 'etiquette',         label: 'Étiquette colis/palette',       icon: 'ti-tag' },
  { key: 'bordereau',         label: 'Bordereau transporteur',        icon: 'ti-truck' },
  { key: 'recap_enlevement',  label: 'Récapitulatif enlèvement',      icon: 'ti-clipboard-list' },
]

const PRODUCTS = ['Noisettes', 'Amandes', 'Noix de pécan', 'Huile de noisette', 'Praliné', 'Poudre', 'Autre']
const UNITS = ['kg', 'sacs', 'cartons', 'palettes', 'sachets']
const CARRIERS = ['GEODIS', 'GLS', 'Chronopost', 'Colissimo', 'DHL', 'DPD', 'TNT', 'Autre']

function fmtDate(d: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtSize(b: number) { return b < 1048576 ? `${(b/1024).toFixed(0)} Ko` : `${(b/1048576).toFixed(1)} Mo` }

function StatusSelect({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const s = STATUSES[status] || STATUSES.a_preparer
  return (
    <select
      className={styles.statusSelect}
      style={{ color: s.color, background: s.bg, borderColor: s.color + '44' }}
      value={status}
      onChange={e => onChange(e.target.value)}
    >
      {STATUS_ORDER.map(k => (
        <option key={k} value={k}>{STATUSES[k].label}</option>
      ))}
    </select>
  )
}

function LinesDisplay({ lines }: { lines: OrderLine[] }) {
  return (
    <div className={styles.linesDisplay}>
      {lines.map((l, i) => (
        <div key={i} className={styles.lineItem}>
          <span className={styles.lineProduct}>{l.product}{l.variety ? ` — ${l.variety}` : ''}</span>
          <span className={styles.lineQty}>{l.quantity} {l.unit}</span>
          {l.packaging && <span className={styles.linePack}>{l.packaging}</span>}
          {l.lot_number && <span className={styles.lineLot}>Lot {l.lot_number}</span>}
        </div>
      ))}
    </div>
  )
}

/* ─── ORDER CARD (À PRÉPARER) ────────────────────────────────── */
function OrderCard({ order, onStatusChange, onUpload, onPreview, onDownload, onDelete, userId, supabase }: {
  order: Order
  onStatusChange: (id: string, status: string) => void
  onUpload: (orderId: string, docType: string, file: File) => void
  onPreview: (att: OrderAttachment) => void
  onDelete: (id: string) => void
  onDownload: (path: string) => void
  userId: string
  supabase: SupabaseClient
}) {
  const st = STATUSES[order.status] || STATUSES.a_preparer
  const nextStatus = st.next
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const getAttachment = (docType: string) =>
    order.attachments?.find(a => a.doc_type === docType)

  // Lot numbers on this order (linked finished lots, line lot numbers, or order-level)
  const lotNumbers = (() => {
    const s = new Set<string>()
    ;(order.lines || []).forEach((l: any) => { if (l.finished_lots?.lot_number) s.add(l.finished_lots.lot_number) })
    ;(order.lines || []).forEach((l: any) => { if (l.lot_number && l.lot_number.trim() && !l.lot_number.toLowerCase().includes('xxxx')) s.add(l.lot_number.trim()) })
    if (order.lot_number && order.lot_number.trim() && !order.lot_number.toLowerCase().includes('xxxx')) s.add(order.lot_number.trim())
    return s
  })()

  // Option A: download the PDFs (étiquette + BDL + facture) and open a pre-filled email.
  const prepareClientEmail = async () => {
    // Fetch the file and download it only if it's really a PDF (avoids saving JSON errors).
    const dlBlob = async (url: string, filename: string): Promise<boolean> => {
      try {
        const res = await fetch(url)
        if (!res.ok || !(res.headers.get('content-type') || '').includes('pdf')) return false
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 15000)
        return true
      } catch { return false }
    }

    let info: any = { found: false }
    try { info = await fetch(`/api/order-client?order=${encodeURIComponent(order.order_number)}`).then(r => r.json()) } catch { /* ignore */ }

    const missing: string[] = []
    for (const ln of Array.from(lotNumbers)) {
      const ok = await dlBlob(`/api/export/colis-pdf?lot=${encodeURIComponent(ln)}`, `Etiquette-${ln}.pdf`)
      if (!ok) missing.push(`l'étiquette du lot « ${ln} » (lot non enregistré ?)`)
    }
    const bdlOk = await dlBlob(`/api/export/sellsy-doc?order=${encodeURIComponent(order.order_number)}&type=delivery`, `${order.order_number}.pdf`)
    if (!bdlOk) missing.push('le bon de livraison (BDL introuvable dans Sellsy)')
    if (info.hasInvoice) {
      const invOk = await dlBlob(`/api/export/sellsy-doc?order=${encodeURIComponent(order.order_number)}&type=invoice`, `Facture-${order.order_number}.pdf`)
      if (!invOk) missing.push('la facture')
    } else {
      missing.push("la facture (BDL pas encore converti en facture dans Sellsy)")
    }

    const body = [
      'Bonjour,', '',
      'Je vous remercie pour votre commande. Vous trouverez ci-joint les informations techniques de vos produits, le bon de livraison ainsi que la facture.', '',
      'Vous remerciant pour votre confiance.', '',
      'Bien cordialement,', 'Benjamin pour S.O.L.',
    ].join('\n')
    const subject = `Votre commande ${order.order_number} — SOL`
    const to = info.email || ''
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    const notes: string[] = []
    if (!to) notes.push('destinataire vide (renseigne le contact de facturation dans Sellsy)')
    if (missing.length) notes.push('non joint(s) : ' + missing.join(' ; '))
    if (notes.length) setTimeout(() => alert('Documents téléchargés. À compléter à la main :\n\n- ' + notes.join('\n- ')), 300)
  }

  return (
    <div className={`${styles.card} ${order.status === 'livre' ? styles.cardDone : ''}`}>
      <div className={styles.cardHeader}>
        <span className={styles.orderNum}>#{order.order_number}</span>
        <StatusSelect status={order.status} onChange={s => onStatusChange(order.id, s)} />
        <button
          className={styles.deleteOrderBtn}
          title="Supprimer cette commande"
          onClick={() => {
            if (confirm(`Supprimer la commande #${order.order_number} ? Cette action est irréversible.`))
              onDelete(order.id)
          }}>
          <i className="ti ti-trash" style={{ fontSize: 14 }} />
        </button>
      </div>

      <div className={styles.cardMeta}>
        <span><i className="ti ti-user" /> {order.client}</span>
        {order.destination && <span><i className="ti ti-map-pin" /> {order.destination}</span>}
        {order.carrier && <span><i className="ti ti-truck" /> {order.carrier}</span>}
        {order.ship_date && <span><i className="ti ti-calendar" /> {fmtDate(order.ship_date)}</span>}
        {order.tracking_number && <span><i className="ti ti-package" /> {order.tracking_number}</span>}
        {order.lot_number && <span><i className="ti ti-hash" /> Lot {order.lot_number}</span>}
      </div>

      {order.lines && order.lines.length > 0 && <LinesDisplay lines={order.lines} />}

      {/* Étiquettes lots */}
      {lotNumbers.size > 0 && (
        <div className={styles.lotLabels}>
          {Array.from(lotNumbers).map(ln => (
            <a key={ln}
              href={`/api/export/lot-label?lot=${encodeURIComponent(ln)}&order=${encodeURIComponent(order.order_number)}`}
              target="_blank"
              className={styles.lotLabelBtn}>
              <i className="ti ti-tag" style={{ fontSize: 12 }} />
              Étiquette {ln}
            </a>
          ))}
        </div>
      )}

      {/* Option A — préparer l'email client (télécharge étiquette + BDL + facture, ouvre un mail pré-rempli) */}
      <button
        onClick={prepareClientEmail}
        title="Télécharge l'étiquette, le BDL et la facture, puis ouvre un email pré-rempli"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginTop: 10,
          background: '#e1f5ee', color: '#0f6e56', border: '0.5px solid #0f6e5644', borderRadius: 8, fontSize: 13 }}>
        <i className="ti ti-mail-forward" style={{ fontSize: 14 }} />
        Préparer l'email client
      </button>

      {/* Documents */}
      <div className={styles.docs}>
        {DOC_TYPES.map(dt => {
          const att = getAttachment(dt.key)
          return (
            <div key={dt.key} className={styles.docSlot}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add(styles.slotDragging) }}
              onDragLeave={e => e.currentTarget.classList.remove(styles.slotDragging)}
              onDrop={e => {
                e.preventDefault()
                e.currentTarget.classList.remove(styles.slotDragging)
                const file = e.dataTransfer.files[0]
                if (file) onUpload(order.id, dt.key, file)
              }}
            >
              {att ? (
                <div className={styles.docPresent}>
                  <i className={`ti ${dt.icon}`} style={{ color: '#0f6e56' }} />
                  <button className={styles.docName} onClick={() => onPreview(att)}>{att.name}</button>
                  <button onClick={() => onDownload(att.storage_path)} className={styles.docAction} title="Télécharger">
                    <i className="ti ti-download" />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="file" style={{ display: 'none' }}
                    ref={el => { fileRefs.current[dt.key] = el }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) onUpload(order.id, dt.key, f)
                    }}
                  />
                  <button
                    className={styles.docMissing}
                    onClick={() => fileRefs.current[dt.key]?.click()}
                  >
                    <i className={`ti ${dt.icon}`} />
                    <span>{dt.label}</span>
                    <i className="ti ti-upload" style={{ fontSize: 11, color: '#aaa' }} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {order.notes && <p className={styles.cardNotes}><i className="ti ti-note" /> {order.notes}</p>}

      {/* Sellsy invoice button when shipped */}
      {order.status === 'envoye' && (
        <button className={styles.sellsyBtn} onClick={async () => {
          const res = await fetch('/api/sellsy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'create_invoice',
              client_name: order.client,
              order_number: order.order_number,
              lines: order.lines || [],
            }),
          })
          const data = await res.json()
          if (data.success) alert(`✓ Facture ${data.invoice_number} créée dans Sellsy`)
          else alert(`Erreur : ${data.error}`)
        }}>
          <i className="ti ti-receipt" /> Créer facture dans Sellsy
        </button>
      )}
    </div>
  )
}

/* ─── NEW ORDER FORM ──────────────────────────────────────────── */
const emptyLine = (): OrderLine => ({ product: 'Noisettes', variety: '', quantity: '', unit: 'kg', packaging: '', lot_number: '', sort_order: 0 })

function NewOrderForm({ sectionId, userId, supabase, onCreated, onCancel }: {
  sectionId: string; userId: string; supabase: SupabaseClient
  onCreated: (order: Order) => void; onCancel: () => void
}) {
  const [form, setForm] = useState({
    order_number: '', client: '', destination: '', carrier: 'GEODIS',
    ship_date: '', tracking_number: '', lot_number: '', notes: '',
  })
  const [lines, setLines] = useState<OrderLine[]>([emptyLine()])
  const [lineFinishedLots, setLineFinishedLots] = useState<Record<number, string>>({})
  const [availableLots, setAvailableLots] = useState<{
    id: string; lot_number: string; product_type: string; product_name: string
    format: string; units_remaining: number; variety?: string
  }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('finished_lots')
      .select('id, lot_number, product_type, product_name, format, units_remaining, lots(variety)')
      .gt('units_remaining', 0)
      .order('production_date', { ascending: false })
      .then(({ data }) => setAvailableLots((data || []).map((d: any) => ({
        ...d,
        variety: d.lots?.variety || '',
      }))))
  }, [])

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setLine = (i: number, k: keyof OrderLine, v: string) =>
    setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, { ...emptyLine(), sort_order: ls.length }])
  const removeLine = (i: number) => setLines(ls => ls.filter((_, j) => j !== i))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.order_number || !form.client) return
    setSaving(true)

    const { data: order, error } = await supabase
      .from('orders')
      .insert({ ...form, section_id: sectionId, created_by: userId, status: 'a_preparer' })
      .select('*').single()

    if (error || !order) { setSaving(false); return }

    // Insert lines with optional finished_lot_id
    if (lines.some(l => l.product)) {
      await supabase.from('order_lines').insert(
        lines.filter(l => l.product).map((l, i) => ({
          ...l,
          order_id: order.id,
          sort_order: i,
          finished_lot_id: lineFinishedLots[i] || null,
        }))
      )
    }

    onCreated({ ...order, lines: lines.filter(l => l.product), attachments: [] })
    setSaving(false)
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3 className={styles.formTitle}>Nouvelle commande</h3>

      <div className={styles.formGrid2}>
        <div className={styles.field}>
          <label>N° commande *</label>
          <input required value={form.order_number} onChange={e => setField('order_number', e.target.value)} placeholder="2024-001" />
        </div>
        <div className={styles.field}>
          <label>Client *</label>
          <input required value={form.client} onChange={e => setField('client', e.target.value)} placeholder="Nom du client" />
        </div>
        <div className={styles.field}>
          <label>Destination</label>
          <input value={form.destination} onChange={e => setField('destination', e.target.value)} placeholder="Ville, Pays" />
        </div>
        <div className={styles.field}>
          <label>Transporteur</label>
          <select value={form.carrier} onChange={e => setField('carrier', e.target.value)}>
            {CARRIERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Date d'expédition</label>
          <input type="date" value={form.ship_date} onChange={e => setField('ship_date', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>N° de lot (global)</label>
          <input value={form.lot_number} onChange={e => setField('lot_number', e.target.value)} placeholder="LOT-2024-01" />
        </div>
      </div>

      {/* Product lines */}
      <div className={styles.linesSection}>
        <div className={styles.linesSectionHeader}>
          <label>Lignes produits</label>
          <button type="button" className={styles.addLineBtn} onClick={addLine}>
            <i className="ti ti-plus" /> Ajouter une ligne
          </button>
        </div>
        {lines.map((line, i) => (
          <div key={i} className={styles.lineRow}>
            <select value={line.product} onChange={e => setLine(i, 'product', e.target.value)} className={styles.lineSelect}>
              {PRODUCTS.map(p => <option key={p}>{p}</option>)}
            </select>
            <input value={line.variety} onChange={e => setLine(i, 'variety', e.target.value)} placeholder="Variété" className={styles.lineInput} />
            <input value={line.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} placeholder="Qté" className={styles.lineQtyInput} />
            <select value={line.unit} onChange={e => setLine(i, 'unit', e.target.value)} className={styles.lineUnitSelect}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
            <input value={line.packaging} onChange={e => setLine(i, 'packaging', e.target.value)} placeholder="Conditionnement" className={styles.lineInput} />
            <input value={line.lot_number} onChange={e => setLine(i, 'lot_number', e.target.value)} placeholder="N° lot" className={styles.lineInput} />
            {/* Stock lot selector — auto-fills all fields */}
            {availableLots.length > 0 && (
              <select className={styles.lineSelect}
                value={lineFinishedLots[i] || ''}
                onChange={e => {
                  const fl = availableLots.find(l => l.id === e.target.value)
                  setLineFinishedLots(prev => ({ ...prev, [i]: e.target.value }))
                  if (fl) {
                    // Auto-fill all line fields from the selected lot
                    const VARIETY_NAMES: Record<string,string> = {
                      PAU:'Pauetet', COR:'Corabel', TON:'Tonda', SEG:'Segorbe', LEW:'Lewis'
                    }
                    const PRODUCT_NAMES: Record<string,string> = {
                      D:'Noisettes décortiquées BIO', T:'Noisettes torréfiées BIO',
                      P:'Poudre de noisettes BIO', H:'Huile de noisettes BIO',
                    }
                    // Parse format: "5 KG" → qty=5 unit=kg | "250g" → qty=250 unit=g | "3L" → qty=3 unit=L
                    const fmt = fl.format.toLowerCase()
                    let qty = '', unit = 'kg'
                    const m = fmt.match(/^(\d+)\s*(kg|g|l|cl|ml)/)
                    if (m) { qty = m[1]; unit = m[2] }

                    setLines(ls => ls.map((l, j) => j !== i ? l : {
                      ...l,
                      product: PRODUCT_NAMES[fl.product_type] || fl.product_name,
                      variety: fl.variety ? (VARIETY_NAMES[fl.variety] || fl.variety) : l.variety,
                      quantity: qty,
                      unit,
                      packaging: fl.format,
                      lot_number: fl.lot_number,
                    }))
                  }
                }}
                title="Sélectionner depuis le stock — remplit automatiquement">
                <option value="">— Choisir dans le stock —</option>
                {availableLots.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.lot_number} · {l.format} · {l.units_remaining} unités
                  </option>
                ))}
              </select>
            )}
            {lines.length > 1 && (
              <button type="button" onClick={() => removeLine(i)} className={styles.removeLine}>✕</button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.field} style={{ gridColumn: '1/-1' }}>
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="Instructions particulières…" />
      </div>

      <div className={styles.formActions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Annuler</button>
        <button type="submit" disabled={saving} className={styles.saveBtn}>
          {saving ? 'Création…' : 'Créer la commande'}
        </button>
      </div>
    </form>
  )
}

/* ─── TABLE VIEW ─────────────────────────────────────────────── */
function OrderTable({ orders, onStatusChange }: {
  orders: Order[]
  onStatusChange: (id: string, status: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter
    const q = search.toLowerCase()
    const matchSearch = !q || o.order_number.toLowerCase().includes(q) ||
      o.client.toLowerCase().includes(q) || (o.lot_number || '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const exportCsv = () => {
    const headers = ['N°', 'Client', 'Produits', 'N° lot', 'Transporteur', 'Statut', 'Date envoi', 'Tracking']
    const rows = filtered.map(o => [
      o.order_number, o.client,
      (o.lines || []).map(l => `${l.product} ${l.quantity}${l.unit}`).join(' | '),
      o.lot_number || '', o.carrier || '',
      STATUSES[o.status]?.label || o.status,
      o.ship_date ? fmtDate(o.ship_date) : '',
      o.tracking_number || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `commandes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className={styles.tableView}>
      <div className={styles.tableControls}>
        <div className={styles.filters}>
          {['all', ...STATUS_ORDER].map(s => (
            <button key={s} className={filter === s ? styles.filterOn : styles.filterOff}
              onClick={() => setFilter(s)}>
              {s === 'all' ? 'Toutes' : STATUSES[s]?.label}
            </button>
          ))}
        </div>
        <input className={styles.tableSearch} value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" />
        <button className={styles.exportBtn} onClick={exportCsv}>
          <i className="ti ti-download" /> CSV
        </button>
        <a href="/api/export/commandes" download className={styles.exportBtn} style={{ textDecoration: 'none', color: '#0f6e56', background: '#e1f5ee', borderColor: '#0f6e5644' }}>
          <i className="ti ti-file-spreadsheet" /> Export livrées (CSV)
        </a>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>N° commande</th>
              <th>Client</th>
              <th>Produits</th>
              <th>N° lot</th>
              <th>Transporteur</th>
              <th>Statut</th>
              <th>Date envoi</th>
              <th>Tracking</th>
              <th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className={o.status === 'livre' ? styles.rowDone : ''}>
                <td className={styles.tdNum}>#{o.order_number}</td>
                <td>{o.client}</td>
                <td>
                  {(o.lines || []).map((l, i) => (
                    <div key={i} className={styles.tdLine}>
                      {l.product}{l.variety ? ` — ${l.variety}` : ''} · {l.quantity} {l.unit}
                    </div>
                  ))}
                </td>
                <td>{o.lot_number || '–'}</td>
                <td>{o.carrier || '–'}</td>
                <td>
                  <StatusSelect status={o.status} onChange={s => onStatusChange(o.id, s)} />
                </td>
                <td>{o.ship_date ? fmtDate(o.ship_date) : '–'}</td>
                <td className={styles.tdTracking}>{o.tracking_number || '–'}</td>
                <td>
                  <div className={styles.tdDocs}>
                    {DOC_TYPES.map(dt => {
                      const has = o.attachments?.some(a => a.doc_type === dt.key)
                      return (
                        <i key={dt.key} className={`ti ${dt.icon}`}
                          style={{ color: has ? '#0f6e56' : '#d3d1c7', fontSize: 14 }}
                          title={dt.label} />
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className={styles.tdEmpty}>Aucune commande</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */
export default function CommandesView({ sectionId, userId, profile, supabase }: {
  sectionId: string; userId: string; profile: Profile; supabase: SupabaseClient
}) {
  const [tab, setTab] = useState<'prepare' | 'table' | 'new'>('prepare')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<OrderAttachment | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  useEffect(() => {
    loadOrders()
  }, [sectionId])

  const loadOrders = async () => {
    setLoading(true)
    const { data: ordersData } = await supabase.from('orders').select('*')
      .eq('section_id', sectionId).order('created_at', { ascending: false })
    if (!ordersData) { setLoading(false); return }

    const [{ data: linesData }, { data: attData }] = await Promise.all([
      supabase.from('order_lines').select('*, finished_lots(lot_number)').in('order_id', ordersData.map(o => o.id)).order('sort_order'),
      supabase.from('order_attachments').select('*').in('order_id', ordersData.map(o => o.id)),
    ])

    setOrders(ordersData.map(o => ({
      ...o,
      lines: linesData?.filter(l => l.order_id === o.id) || [],
      attachments: attData?.filter(a => a.order_id === o.id) || [],
    })))
    setLoading(false)
  }

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const prevStatus = orders.find(o => o.id === orderId)?.status
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)

    // Level 2: decrement stock only when moving FORWARD into "envoyé"
    // (not when downgrading e.g. livré → envoyé, which would double-decrement).
    const movingForwardToShipped = newStatus === 'envoye'
      && (!prevStatus || STATUS_ORDER.indexOf(prevStatus) < STATUS_ORDER.indexOf('envoye'))
    if (movingForwardToShipped) {
      const { data: lines } = await supabase
        .from('order_lines')
        .select('finished_lot_id, quantity')
        .eq('order_id', orderId)
        .not('finished_lot_id', 'is', null)

      for (const line of (lines || [])) {
        if (!line.finished_lot_id) continue
        const qty = parseInt(line.quantity) || 0
        if (qty <= 0) continue
        const { data: fl } = await supabase
          .from('finished_lots')
          .select('units_remaining')
          .eq('id', line.finished_lot_id)
          .single()
        if (fl) {
          const newRemaining = Math.max(0, fl.units_remaining - qty)
          await supabase.from('finished_lots').update({ units_remaining: newRemaining }).eq('id', line.finished_lot_id)
        }
      }
    }

    setOrders(os => os.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
  }

  const handleDelete = async (orderId: string) => {
    // Delete attachments from storage first
    const { data: atts } = await supabase.from('order_attachments').select('storage_path').eq('order_id', orderId)
    if (atts?.length) {
      await supabase.storage.from('hanoa-files').remove(atts.map((a: any) => a.storage_path))
    }
    // Delete order (cascades to order_lines, order_attachments)
    await supabase.from('orders').delete().eq('id', orderId)
    setOrders(os => os.filter(o => o.id !== orderId))
  }

  const handleUpload = async (orderId: string, docType: string, file: File) => {
    const path = `${userId}/commandes/${orderId}/${docType}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hanoa-files').upload(path, file)
    if (error) return
    const { data: att } = await supabase.from('order_attachments')
      .insert({ order_id: orderId, doc_type: docType, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size })
      .select('*').single()
    if (att) {
      setOrders(os => os.map(o => o.id === orderId
        ? { ...o, attachments: [...(o.attachments || []).filter(a => a.doc_type !== docType), att] }
        : o))
    }
  }

  const handleDownload = async (path: string) => {
    const { data } = await supabase.storage.from('hanoa-files').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const pending = orders.filter(o => o.status !== 'livre')
  const stats = STATUS_ORDER.map(s => ({ status: s, count: orders.filter(o => o.status === s).length }))

  return (
    <div className={styles.container}>
      {preview && (
        <DocPreview storagePath={preview.storage_path} fileName={preview.name}
          mimeType={preview.mime_type} supabase={supabase} onClose={() => setPreview(null)} />
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>Commandes</h2>
          <div className={styles.stats}>
            {stats.map(s => {
              const active = statusFilter === s.status && tab === 'prepare'
              return (
                <button key={s.status} className={styles.stat}
                  onClick={() => { setStatusFilter(s.status); setTab('prepare') }}
                  title={`Voir les commandes « ${STATUSES[s.status].label} »`}
                  style={{ color: STATUSES[s.status].color, background: STATUSES[s.status].bg,
                    cursor: 'pointer', border: `1.5px solid ${active ? STATUSES[s.status].color : 'transparent'}` }}>
                  {s.count} {STATUSES[s.status].label.toLowerCase()}
                </button>
              )
            })}
          </div>
        </div>
        <button className={styles.newBtn} onClick={() => setTab('new')}>
          <i className="ti ti-plus" /> Nouvelle commande
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === 'prepare' && !statusFilter ? styles.tabOn : styles.tabOff} onClick={() => { setTab('prepare'); setStatusFilter(null) }}>
          <i className="ti ti-list-check" /> À préparer {pending.length > 0 && <span className={styles.tabBadge}>{pending.length}</span>}
        </button>
        <button className={tab === 'table' ? styles.tabOn : styles.tabOff} onClick={() => setTab('table')}>
          <i className="ti ti-table" /> Tableau récapitulatif
        </button>
        <button className={tab === 'new' ? styles.tabOn : styles.tabOff} onClick={() => setTab('new')}>
          <i className="ti ti-plus" /> Nouvelle commande
        </button>
      </div>

      {loading && <div className={styles.loading}><i className="ti ti-loader" /> Chargement…</div>}

      {/* Cartes — par défaut les commandes en cours, ou filtrées par statut cliqué */}
      {!loading && tab === 'prepare' && (() => {
        const cardOrders = statusFilter ? orders.filter(o => o.status === statusFilter) : pending
        return (
          <div className={styles.cards}>
            {statusFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1 / -1', marginBottom: 2, fontSize: 13, color: 'var(--muted)' }}>
                <span>Filtre : <strong style={{ color: STATUSES[statusFilter].color }}>{STATUSES[statusFilter].label}</strong></span>
                <button onClick={() => setStatusFilter(null)} style={{ color: 'var(--green)', fontSize: 13 }}>✕ Tout afficher (en cours)</button>
              </div>
            )}
            {cardOrders.length === 0 && (
              <div className={styles.empty}>
                <i className="ti ti-package" style={{ fontSize: 32, color: '#d3d1c7' }} />
                <p>Aucune commande{statusFilter ? ` « ${STATUSES[statusFilter].label} »` : ' en cours'}</p>
              </div>
            )}
            {cardOrders.map(o => (
              <OrderCard key={o.id} order={o}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onUpload={handleUpload}
                onPreview={setPreview}
                onDownload={handleDownload}
                userId={userId}
                supabase={supabase}
              />
            ))}
          </div>
        )
      })()}

      {/* Tableau */}
      {!loading && tab === 'table' && (
        <OrderTable orders={orders} onStatusChange={handleStatusChange} />
      )}

      {/* Nouvelle commande */}
      {tab === 'new' && (
        <NewOrderForm
          sectionId={sectionId} userId={userId} supabase={supabase}
          onCreated={order => { setOrders(os => [order, ...os]); setTab('prepare') }}
          onCancel={() => setTab('prepare')}
        />
      )}
    </div>
  )
}
