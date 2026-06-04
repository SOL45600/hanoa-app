'use client'
import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Lot, LotStage, FinishedLot } from './LotsView'
import { VARIETIES, PRODUCERS, STAGES, STATUS_CONFIG, CALIBERS, PRODUCT_TYPES, generateFinishedLotNumber, addDefaultDDM } from './config'
import { Profile } from '@/lib/types'
import styles from './Lots.module.css'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  lot: Lot
  supabase: SupabaseClient
  userId: string
  profile: Profile
  onBack: () => void
  onRefresh: () => void
}

/* ─── STAGE MODAL ──────────────────────────────────────────── */
function StageModal({ lot, supabase, userId, profile, onSaved, onClose }: {
  lot: Lot; supabase: SupabaseClient; userId: string; profile: Profile
  onSaved: () => void; onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [stageType, setStageType] = useState('lavage')
  const [form, setForm] = useState({
    stage_date: today, operator: profile.full_name,
    weight_in_kg: '', weight_out_kg: '', temperature_c: '',
    humidity_pct_out: '', quality_score: '', notes: '',
  })
  const [calibration, setCalibration] = useState<Record<string, string>>({
    '<11mm': '', '11-13mm': '', '13-15mm': '', '>15mm': '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const config = STAGES[stageType]

  // Determine which stages are available
  const stagesOrder = ['lavage', 'sechage', 'calibrage', 'cassage', 'torreflaction', 'presse', 'broyage']
  const doneStages = (lot.lot_stages || []).map(s => s.stage_type)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const stageData: Record<string, unknown> = {
      lot_id: lot.id,
      stage_type: stageType,
      stage_date: form.stage_date,
      operator: form.operator || null,
      notes: form.notes || null,
    }
    if (form.weight_in_kg) stageData.weight_in_kg = parseFloat(form.weight_in_kg)
    if (form.weight_out_kg) stageData.weight_out_kg = parseFloat(form.weight_out_kg)
    if (form.temperature_c) stageData.temperature_c = parseFloat(form.temperature_c)
    if (form.humidity_pct_out) stageData.humidity_pct_out = parseFloat(form.humidity_pct_out)
    if (form.quality_score) stageData.quality_score = parseInt(form.quality_score)

    await supabase.from('lot_stages').insert(stageData)

    // Save calibration if calibrage
    if (stageType === 'calibrage') {
      const calibEntries = CALIBERS
        .filter(c => parseFloat(calibration[c] || '0') > 0)
        .map(c => ({ lot_id: lot.id, caliber: c, weight_kg: parseFloat(calibration[c]) }))
      if (calibEntries.length > 0) {
        await supabase.from('lot_calibration').delete().eq('lot_id', lot.id)
        await supabase.from('lot_calibration').insert(calibEntries)
      }
    }

    // Update lot status
    const statusMap: Record<string, string> = {
      lavage: 'lavage', sechage: 'seche', calibrage: 'calibre',
      cassage: 'en_transformation', torreflaction: 'en_transformation',
      presse: 'en_transformation', broyage: 'en_transformation',
    }
    if (statusMap[stageType]) {
      await supabase.from('lots').update({ status: statusMap[stageType] }).eq('id', lot.id)
    }

    onSaved()
    setSaving(false)
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Enregistrer une étape</h3>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>
        <form onSubmit={submit} className={styles.modalBody}>
          {/* Stage selector */}
          <div className={styles.stageSelector}>
            {stagesOrder.map(s => {
              const sc = STAGES[s]
              const done = doneStages.includes(s)
              return (
                <button key={s} type="button"
                  className={`${styles.stageBtn} ${stageType === s ? styles.stageBtnActive : ''} ${done ? styles.stageBtnDone : ''}`}
                  style={stageType === s ? { borderColor: sc.color, background: sc.color + '18', color: sc.color } : {}}
                  onClick={() => setStageType(s)}>
                  <i className={`ti ${sc.icon}`} />
                  <span>{sc.label}</span>
                  {done && <i className="ti ti-check" style={{ fontSize: 10 }} />}
                </button>
              )
            })}
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Date *</label>
              <input type="date" required value={form.stage_date} onChange={e => set('stage_date', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Opérateur</label>
              <input value={form.operator} onChange={e => set('operator', e.target.value)} />
            </div>

            {/* Sechage fields */}
            {stageType === 'sechage' && (<>
              <div className={styles.field}>
                <label>Humidité sortie (%)</label>
                <input type="number" step="0.1" value={form.humidity_pct_out} onChange={e => set('humidity_pct_out', e.target.value)} placeholder="Ex: 8.5" />
              </div>
              <div className={styles.field}>
                <label>Qualité (1–5)</label>
                <select value={form.quality_score} onChange={e => set('quality_score', e.target.value)}>
                  <option value="">–</option>
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} {'★'.repeat(n)}</option>)}
                </select>
              </div>
            </>)}

            {/* Calibrage — weight by caliber */}
            {stageType === 'calibrage' && (
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Poids par calibre (kg) — relevé chariot élévateur</label>
                <div className={styles.calibrationGrid}>
                  {CALIBERS.map(c => (
                    <div key={c} className={styles.calibField}>
                      <span className={styles.calibLabel}>{c}</span>
                      <input type="number" step="0.1" min="0"
                        value={calibration[c]}
                        onChange={e => setCalibration(cl => ({ ...cl, [c]: e.target.value }))}
                        placeholder="0" />
                      <span className={styles.calibUnit}>kg</span>
                    </div>
                  ))}
                  <div className={styles.calibTotal}>
                    Total : <strong>{CALIBERS.reduce((s, c) => s + (parseFloat(calibration[c] || '0')), 0).toFixed(1)} kg</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Weight fields for cassage, torreflaction, etc. */}
            {['cassage', 'torreflaction', 'presse', 'broyage'].includes(stageType) && (<>
              <div className={styles.field}>
                <label>Poids entrée (kg)</label>
                <input type="number" step="0.1" value={form.weight_in_kg} onChange={e => set('weight_in_kg', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Poids sortie (kg)</label>
                <input type="number" step="0.1" value={form.weight_out_kg} onChange={e => set('weight_out_kg', e.target.value)} />
              </div>
            </>)}

            {stageType === 'torreflaction' && (
              <div className={styles.field}>
                <label>Température (°C)</label>
                <input type="number" value={form.temperature_c} onChange={e => set('temperature_c', e.target.value)} placeholder="Ex: 140" />
              </div>
            )}

            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Annuler</button>
            <button type="submit" disabled={saving} className={styles.saveBtn}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── CONDITIONING MODAL ───────────────────────────────────── */
function ConditioningModal({ lot, supabase, onSaved, onClose }: {
  lot: Lot; supabase: SupabaseClient; onSaved: () => void; onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [productCode, setProductCode] = useState('D')
  const [form, setForm] = useState({
    format: '5kg', units_produced: '', total_weight_kg: '',
    production_date: today, ddm: addDefaultDDM(today), notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const product = PRODUCT_TYPES[productCode]
  const finishedLotNumber = generateFinishedLotNumber(lot.lot_number, productCode)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await supabase.from('finished_lots').insert({
      parent_lot_id: lot.id,
      lot_number: finishedLotNumber,
      product_type: productCode,
      product_name: product.label,
      format: form.format,
      units_produced: parseInt(form.units_produced) || 0,
      total_weight_kg: form.total_weight_kg ? parseFloat(form.total_weight_kg) : null,
      production_date: form.production_date,
      ddm: form.ddm || null,
      units_remaining: parseInt(form.units_produced) || 0,
      notes: form.notes || null,
    })
    await supabase.from('lots').update({ status: 'conditionne' }).eq('id', lot.id)
    onSaved()
    setSaving(false)
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h3>Conditionner — Produit fini</h3>
            <div className={styles.lotPreview}>Lot : <strong>{finishedLotNumber}</strong></div>
          </div>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>
        <form onSubmit={submit} className={styles.modalBody}>
          <div className={styles.productTypeGrid}>
            {Object.entries(PRODUCT_TYPES).map(([code, pt]) => (
              <button key={code} type="button"
                className={`${styles.productTypeBtn} ${productCode === code ? styles.productTypeBtnActive : ''}`}
                onClick={() => { setProductCode(code); set('format', pt.formats[0]) }}>
                <span className={styles.productCode}>{code}</span>
                <span>{pt.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Format *</label>
              <select value={form.format} onChange={e => set('format', e.target.value)}>
                {product.formats.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Nombre d'unités *</label>
              <input type="number" required min="1" value={form.units_produced}
                onChange={e => set('units_produced', e.target.value)} placeholder="Ex: 24" />
            </div>
            <div className={styles.field}>
              <label>Poids total (kg)</label>
              <input type="number" step="0.1" value={form.total_weight_kg}
                onChange={e => set('total_weight_kg', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Date de production</label>
              <input type="date" value={form.production_date}
                onChange={e => { set('production_date', e.target.value); set('ddm', addDefaultDDM(e.target.value)) }} />
            </div>
            <div className={styles.field}>
              <label>DDM (Date Durabilité Min.)</label>
              <input type="date" value={form.ddm} onChange={e => set('ddm', e.target.value)} />
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Annuler</button>
            <button type="submit" disabled={saving} className={styles.saveBtn}>
              {saving ? 'Enregistrement…' : 'Créer le produit fini'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── LOT DETAIL ───────────────────────────────────────────── */
export default function LotDetail({ lot, supabase, userId, profile, onBack, onRefresh }: Props) {
  const [showStage, setShowStage] = useState(false)
  const [showConditioning, setShowConditioning] = useState(false)

  const st = STATUS_CONFIG[lot.status] || STATUS_CONFIG.recu
  const variety = VARIETIES[lot.variety] || lot.variety
  const producer = PRODUCERS[lot.producer_code]
  const stages = (lot.lot_stages || []).sort((a, b) => a.stage_date.localeCompare(b.stage_date))
  const calibTotal = (lot.lot_calibration || []).reduce((s, c) => s + c.weight_kg, 0)

  const stageOrder = ['lavage', 'sechage', 'calibrage', 'cassage', 'torreflaction', 'presse', 'broyage']

  return (
    <div className={styles.detail}>
      {/* Header */}
      <button className={styles.backBtn} onClick={onBack}>
        <i className="ti ti-arrow-left" /> Tous les lots
      </button>

      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderInfo}>
          <div className={styles.detailLotNumber}>{lot.lot_number}</div>
          <div className={styles.detailMeta}>
            <span><i className="ti ti-plant-2" /> {variety}</span>
            <span><i className="ti ti-map-pin" /> {producer?.label}{lot.parcel ? ` — Parcelle ${lot.parcel}` : ''}</span>
            <span><i className="ti ti-calendar" /> Récolte : {fmtDate(lot.harvest_date)}</span>
            {lot.humidity_pct && <span><i className="ti ti-droplet" /> Humidité réception : {lot.humidity_pct}%</span>}
          </div>
        </div>
        <div className={styles.detailActions}>
          <span className={styles.statusBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
          <button className={styles.addStageBtn} onClick={() => setShowStage(true)}>
            <i className="ti ti-plus" /> Étape
          </button>
          <button className={styles.conditionBtn} onClick={() => setShowConditioning(true)}>
            <i className="ti ti-package" /> Conditionner
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Étapes de transformation</p>
        {stages.length === 0 ? (
          <p className={styles.emptySection}>Aucune étape enregistrée — cliquez sur "+ Étape" pour commencer</p>
        ) : (
          <div className={styles.timeline}>
            {stages.map((s, i) => {
              const sc = STAGES[s.stage_type]
              if (!sc) return null
              return (
                <div key={s.id} className={styles.timelineItem}>
                  <div className={styles.timelineDot} style={{ background: sc.color }}>
                    <i className={`ti ${sc.icon}`} style={{ fontSize: 14, color: 'white' }} />
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineTitle}>
                      <span style={{ color: sc.color }}>{sc.label}</span>
                      <span className={styles.timelineDate}>{fmtDate(s.stage_date)}</span>
                      {s.operator && <span className={styles.timelineOp}>{s.operator}</span>}
                    </div>
                    <div className={styles.timelineMeta}>
                      {s.weight_in_kg && <span>Entrée : {s.weight_in_kg} kg</span>}
                      {s.weight_out_kg && <span>Sortie : {s.weight_out_kg} kg</span>}
                      {s.weight_in_kg && s.weight_out_kg && (
                        <span>Rendement : {((s.weight_out_kg / s.weight_in_kg) * 100).toFixed(1)}%</span>
                      )}
                      {s.humidity_pct_out && <span>Humidité sortie : {s.humidity_pct_out}%</span>}
                      {s.quality_score && <span>Qualité : {'★'.repeat(s.quality_score)}{'☆'.repeat(5 - s.quality_score)}</span>}
                      {s.temperature_c && <span>T° : {s.temperature_c}°C</span>}
                    </div>
                    {s.notes && <p className={styles.timelineNotes}>{s.notes}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Calibration */}
      {(lot.lot_calibration || []).length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Résultats calibrage — Total : {calibTotal} kg</p>
          <div className={styles.calibrationResult}>
            {(lot.lot_calibration || []).map(c => (
              <div key={c.id} className={styles.calibBar}>
                <span className={styles.calibBarLabel}>{c.caliber}</span>
                <div className={styles.calibBarTrack}>
                  <div className={styles.calibBarFill}
                    style={{ width: `${(c.weight_kg / calibTotal) * 100}%` }} />
                </div>
                <span className={styles.calibBarValue}>{c.weight_kg} kg ({((c.weight_kg / calibTotal) * 100).toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finished products */}
      {(lot.finished_lots || []).length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Produits finis conditionnés</p>
          {(lot.finished_lots || []).map((fl: FinishedLot) => (
            <div key={fl.id} className={styles.finishedLotCard}>
              <div className={styles.flCode}>{fl.product_type}</div>
              <div className={styles.flInfo}>
                <div className={styles.flName}>{fl.lot_number}</div>
                <div className={styles.flMeta}>
                  {fl.product_name} · {fl.format} · {fl.units_produced} unité{fl.units_produced > 1 ? 's' : ''}
                  {fl.total_weight_kg && ` · ${fl.total_weight_kg} kg`}
                  {fl.ddm && ` · DDM : ${fmtDate(fl.ddm)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {lot.notes && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Notes</p>
          <p className={styles.notesText}>{lot.notes}</p>
        </div>
      )}

      {showStage && (
        <StageModal lot={lot} supabase={supabase} userId={userId} profile={profile}
          onSaved={() => { setShowStage(false); onRefresh() }}
          onClose={() => setShowStage(false)} />
      )}
      {showConditioning && (
        <ConditioningModal lot={lot} supabase={supabase}
          onSaved={() => { setShowConditioning(false); onRefresh() }}
          onClose={() => setShowConditioning(false)} />
      )}
    </div>
  )
}
