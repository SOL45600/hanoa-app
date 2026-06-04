'use client'
import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCT_TYPES } from './config'
import styles from './Lots.module.css'

interface FinishedLot {
  id: string
  lot_number: string
  product_type: string
  product_name: string
  format: string
  units_produced: number
  units_remaining: number
  total_weight_kg?: number
  production_date: string
  ddm?: string
  notes?: string
}

interface Movement {
  id: string
  lot_number: string
  product_type: string
  format: string
  units_used: number
  order_number: string
  client: string
  ship_date?: string
  order_status: string
}

function ddmColor(ddm?: string): string {
  if (!ddm) return '#888'
  const days = Math.ceil((new Date(ddm).getTime() - Date.now()) / 86400000)
  if (days < 30) return '#d85a30'
  if (days < 90) return '#ba7517'
  return '#0f6e56'
}

function ddmLabel(ddm?: string): string {
  if (!ddm) return ''
  const days = Math.ceil((new Date(ddm).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'Expiré'
  if (days < 30) return `⚠ J-${days}`
  if (days < 90) return `J-${days}`
  return new Date(ddm).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDate(d?: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props { supabase: SupabaseClient }

export default function StockView({ supabase }: Props) {
  const [lots, setLots] = useState<FinishedLot[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'stock' | 'mouvements'>('stock')
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  const load = async () => {
    const [{ data: fl }, { data: ol }] = await Promise.all([
      supabase.from('finished_lots').select('*').order('production_date', { ascending: false }),
      supabase.from('order_lines').select('*, orders(order_number, client, ship_date, status)')
        .not('finished_lot_id', 'is', null),
    ])
    setLots(fl || [])
    setMovements((ol || []).map((line: any) => ({
      id: line.id,
      lot_number: (fl || []).find((f: FinishedLot) => f.id === line.finished_lot_id)?.lot_number || '–',
      product_type: (fl || []).find((f: FinishedLot) => f.id === line.finished_lot_id)?.product_type || '–',
      format: (fl || []).find((f: FinishedLot) => f.id === line.finished_lot_id)?.format || '–',
      units_used: parseInt(line.quantity) || 0,
      order_number: line.orders?.order_number || '–',
      client: line.orders?.client || '–',
      ship_date: line.orders?.ship_date,
      order_status: line.orders?.status || '–',
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const adjust = async (lotId: string) => {
    const qty = parseInt(adjustQty)
    if (isNaN(qty)) return
    const lot = lots.find(l => l.id === lotId)
    if (!lot) return
    const newVal = Math.max(0, lot.units_remaining + qty)
    await supabase.from('finished_lots').update({ units_remaining: newVal }).eq('id', lotId)
    setAdjusting(null); setAdjustQty(''); setAdjustReason('')
    load()
  }

  // Group by product type
  const grouped = Object.entries(PRODUCT_TYPES).map(([code, pt]) => ({
    code, pt,
    lots: lots.filter(l => l.product_type === code),
    inStock: lots.filter(l => l.product_type === code && l.units_remaining > 0),
  }))

  const totalInStock = lots.reduce((s, l) => s + l.units_remaining, 0)
  const ddmAlerts = lots.filter(l => l.units_remaining > 0 && l.ddm &&
    Math.ceil((new Date(l.ddm).getTime() - Date.now()) / 86400000) < 90)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Gestion des stocks</h2>
          <p>{totalInStock} unités en chambre froide
            {ddmAlerts.length > 0 && <span style={{ color: '#d85a30', marginLeft: 8 }}>· ⚠ {ddmAlerts.length} DDM à surveiller</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === 'stock' ? styles.tabOn : styles.tabOff} onClick={() => setTab('stock')}>
          <i className="ti ti-package" /> Stock actuel
        </button>
        <button className={tab === 'mouvements' ? styles.tabOn : styles.tabOff} onClick={() => setTab('mouvements')}>
          <i className="ti ti-arrows-exchange" /> Historique sorties ({movements.length})
        </button>
      </div>

      {loading && <div className={styles.loading}><i className="ti ti-loader" /> Chargement…</div>}

      {/* STOCK ACTUEL */}
      {!loading && tab === 'stock' && (
        <div>
          {grouped.map(({ code, pt, lots: typeLots, inStock }) => {
            if (typeLots.length === 0) return null
            const totalUnits = inStock.reduce((s, l) => s + l.units_remaining, 0)
            return (
              <div key={code} className={styles.stockGroup}>
                <div className={styles.stockGroupHeader}>
                  <div className={styles.stockGroupIcon} style={{ background: pt.color + '22', border: `1.5px solid ${pt.color}44` }}>
                    <i className={`ti ${pt.icon}`} style={{ color: pt.color, fontSize: 18 }} />
                  </div>
                  <div>
                    <span className={styles.stockGroupTitle}>{pt.label}</span>
                    <span className={styles.stockGroupTotal}>{totalUnits} unité{totalUnits > 1 ? 's' : ''} disponible{totalUnits > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className={styles.stockTable}>
                  <div className={styles.stockTableHead}>
                    <span>N° Lot</span><span>Format</span><span>DDM</span>
                    <span>Produit</span><span>Restant</span><span>Ajuster</span>
                  </div>
                  {typeLots.map(l => (
                    <div key={l.id} className={`${styles.stockRow} ${l.units_remaining === 0 ? styles.stockRowEmpty : ''}`}>
                      <span className={styles.stockLotNum}>{l.lot_number}</span>
                      <span>{l.format}</span>
                      <span style={{ color: ddmColor(l.ddm), fontWeight: l.ddm && Math.ceil((new Date(l.ddm).getTime() - Date.now()) / 86400000) < 90 ? 600 : 400 }}>
                        {ddmLabel(l.ddm)}
                      </span>
                      <span>{l.units_produced}</span>
                      <span className={styles.stockRemaining} style={{ color: l.units_remaining === 0 ? '#ccc' : undefined }}>
                        {l.units_remaining === 0 ? 'Épuisé' : l.units_remaining}
                      </span>
                      <span>
                        {adjusting === l.id ? (
                          <div className={styles.adjustForm}>
                            <input type="number" value={adjustQty}
                              onChange={e => setAdjustQty(e.target.value)}
                              placeholder="±" style={{ width: 50 }} />
                            <button className={styles.adjustSave} onClick={() => adjust(l.id)}>✓</button>
                            <button className={styles.adjustCancel} onClick={() => setAdjusting(null)}>✕</button>
                          </div>
                        ) : (
                          <button className={styles.adjustBtn} onClick={() => setAdjusting(l.id)}>
                            <i className="ti ti-adjustments" style={{ fontSize: 13 }} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {totalInStock === 0 && (
            <div className={styles.empty}>
              <i className="ti ti-package" style={{ fontSize: 36, color: '#d3d1c7' }} />
              <p>Aucun stock disponible</p>
              <p style={{ fontSize: 12, color: '#aaa' }}>Conditionnez des lots depuis la section Lots</p>
            </div>
          )}
        </div>
      )}

      {/* HISTORIQUE MOUVEMENTS */}
      {!loading && tab === 'mouvements' && (
        <div>
          {movements.length === 0 ? (
            <div className={styles.empty}>
              <i className="ti ti-arrows-exchange" style={{ fontSize: 36, color: '#d3d1c7' }} />
              <p>Aucun mouvement de stock enregistré</p>
              <p style={{ fontSize: 12, color: '#aaa' }}>Les sorties apparaîtront ici quand des commandes seront liées à des lots</p>
            </div>
          ) : (
            <div className={styles.movementsTable}>
              <div className={styles.stockTableHead}>
                <span>Lot</span><span>Produit</span><span>Format</span>
                <span>Qté sortie</span><span>Commande</span><span>Client</span><span>Date exp.</span>
              </div>
              {movements.map(m => (
                <div key={m.id} className={styles.stockRow}>
                  <span className={styles.stockLotNum}>{m.lot_number}</span>
                  <span>{PRODUCT_TYPES[m.product_type]?.label?.slice(0, 20) || m.product_type}</span>
                  <span>{m.format}</span>
                  <span style={{ color: '#d85a30', fontWeight: 600 }}>-{m.units_used}</span>
                  <span>#{m.order_number}</span>
                  <span>{m.client}</span>
                  <span>{fmtDate(m.ship_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
