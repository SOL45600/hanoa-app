'use client'
import { Lot } from './LotsView'
import { VARIETIES, PRODUCERS, STATUS_CONFIG } from './config'
import styles from './Lots.module.css'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LotsList({ lots, onSelect }: { lots: Lot[]; onSelect: (l: Lot) => void }) {
  if (lots.length === 0) {
    return (
      <div className={styles.empty}>
        <i className="ti ti-box" style={{ fontSize: 36, color: '#d3d1c7' }} />
        <p>Aucun lot enregistré</p>
        <p style={{ fontSize: 12, color: '#aaa' }}>Créez votre premier lot à la réception d'une livraison</p>
      </div>
    )
  }

  // Group by status
  const active = lots.filter(l => l.status !== 'archive' && l.status !== 'conditionne')
  const conditioned = lots.filter(l => l.status === 'conditionne')
  const archived = lots.filter(l => l.status === 'archive')

  const LotCard = ({ lot }: { lot: Lot }) => {
    const st = STATUS_CONFIG[lot.status] || STATUS_CONFIG.recu
    const producer = PRODUCERS[lot.producer_code]
    const variety = VARIETIES[lot.variety] || lot.variety
    const calibTotal = (lot.lot_calibration || []).reduce((s, c) => s + c.weight_kg, 0)
    const finishedCount = (lot.finished_lots || []).length

    return (
      <button className={styles.lotCard} onClick={() => onSelect(lot)}>
        <div className={styles.lotCardLeft}>
          <div className={styles.lotNumber}>{lot.lot_number}</div>
          <div className={styles.lotMeta}>
            <span><i className="ti ti-calendar" /> {fmtDate(lot.harvest_date)}</span>
            <span><i className="ti ti-plant-2" /> {variety}</span>
            <span><i className="ti ti-map-pin" /> {producer?.label}</span>
            {calibTotal > 0 && <span><i className="ti ti-weight" /> {calibTotal} kg calibré</span>}
            {finishedCount > 0 && <span><i className="ti ti-package" /> {finishedCount} produit{finishedCount > 1 ? 's' : ''} fini{finishedCount > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className={styles.lotCardRight}>
          <span className={styles.statusBadge} style={{ color: st.color, background: st.bg }}>
            {st.label}
          </span>
          <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, marginTop: 6 }} />
        </div>
      </button>
    )
  }

  return (
    <div>
      {active.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupLabel}>En cours ({active.length})</p>
          {active.map(l => <LotCard key={l.id} lot={l} />)}
        </div>
      )}
      {conditioned.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupLabel}>Conditionnés ({conditioned.length})</p>
          {conditioned.map(l => <LotCard key={l.id} lot={l} />)}
        </div>
      )}
      {archived.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupLabel}>Archivés ({archived.length})</p>
          {archived.map(l => <LotCard key={l.id} lot={l} />)}
        </div>
      )}
    </div>
  )
}
