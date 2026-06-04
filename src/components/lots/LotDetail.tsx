'use client'
import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Lot, LotStage, FinishedLot } from './LotsView'
import {
  VARIETIES, PRODUCERS, STAGES, STATUS_CONFIG,
  CALIBERS, PRODUCT_TYPES, generateFinishedLotNumber, addDefaultDDM
} from './config'
import { Profile } from '@/lib/types'
import styles from './Lots.module.css'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ─── STAGE FORM MODAL ─────────────────────────── */
function StageFormModal({ stageType, existingStage, lot, supabase, userId, profile, onSaved, onClose }: {
  stageType: string
  existingStage?: LotStage
  lot: Lot
  supabase: SupabaseClient
  userId: string
  profile: Profile
  onSaved: () => void
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    stage_date: existingStage?.stage_date || today,
    operator: existingStage?.operator || profile.full_name,
    weight_in_kg: existingStage?.weight_in_kg?.toString() || '',
    weight_out_kg: existingStage?.weight_out_kg?.toString() || '',
    temperature_c: existingStage?.temperature_c?.toString() || '',
    humidity_pct_out: existingStage?.humidity_pct_out?.toString() || '',
    quality_score: existingStage?.quality_score?.toString() || '',
    notes: existingStage?.notes || '',
  })
  const [calibration, setCalibration] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    CALIBERS.forEach(c => { init[c] = '' })
    if (lot.lot_calibration) {
      lot.lot_calibration.forEach(e => { init[e.caliber] = e.weight_kg.toString() })
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const config = STAGES[stageType]
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const data: Record<string, unknown> = {
      lot_id: lot.id, stage_type: stageType,
      stage_date: form.stage_date,
      operator: form.operator || null,
      notes: form.notes || null,
    }
    if (form.weight_in_kg) data.weight_in_kg = parseFloat(form.weight_in_kg)
    if (form.weight_out_kg) data.weight_out_kg = parseFloat(form.weight_out_kg)
    if (form.temperature_c) data.temperature_c = parseFloat(form.temperature_c)
    if (form.humidity_pct_out) data.humidity_pct_out = parseFloat(form.humidity_pct_out)
    if (form.quality_score) data.quality_score = parseInt(form.quality_score)

    if (existingStage) {
      await supabase.from('lot_stages').update(data).eq('id', existingStage.id)
    } else {
      await supabase.from('lot_stages').insert(data)
    }

    if (stageType === 'calibrage') {
      const entries = CALIBERS
        .filter(c => parseFloat(calibration[c] || '0') > 0)
        .map(c => ({ lot_id: lot.id, caliber: c, weight_kg: parseFloat(calibration[c]) }))
      await supabase.from('lot_calibration').delete().eq('lot_id', lot.id)
      if (entries.length > 0) await supabase.from('lot_calibration').insert(entries)
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${config.icon}`} style={{ color: 'white', fontSize: 15 }} />
              </div>
              <h3>{config.label}</h3>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{lot.lot_number}</div>
          </div>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>

        <form onSubmit={submit} className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Date *</label>
              <input type="date" required value={form.stage_date} onChange={e => set('stage_date', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Opérateur</label>
              <input value={form.operator} onChange={e => set('operator', e.target.value)} />
            </div>

            {stageType === 'sechage' && (<>
              <div className={styles.field}>
                <label>Humidité sortie (%)</label>
                <input type="number" step="0.1" value={form.humidity_pct_out}
                  onChange={e => set('humidity_pct_out', e.target.value)} placeholder="Ex: 8.0" />
              </div>
              <div className={styles.field}>
                <label>Qualité (1 à 5 étoiles)</label>
                <select value={form.quality_score} onChange={e => set('quality_score', e.target.value)}>
                  <option value="">— Non évalué —</option>
                  {[5,4,3,2,1].map(n => (
                    <option key={n} value={n}>{n} {'★'.repeat(n)}{'☆'.repeat(5-n)}</option>
                  ))}
                </select>
              </div>
            </>)}

            {stageType === 'calibrage' && (
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Poids par calibre (relevé chariot élévateur)</label>
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
                    Total : <strong>
                      {CALIBERS.reduce((s, c) => s + (parseFloat(calibration[c] || '0')), 0).toFixed(1)} kg
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {['cassage', 'torreflaction', 'presse', 'broyage'].includes(stageType) && (<>
              <div className={styles.field}>
                <label>Poids entrée (kg)</label>
                <input type="number" step="0.1" value={form.weight_in_kg}
                  onChange={e => set('weight_in_kg', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Poids sortie (kg)</label>
                <input type="number" step="0.1" value={form.weight_out_kg}
                  onChange={e => set('weight_out_kg', e.target.value)} />
              </div>
            </>)}

            {stageType === 'torreflaction' && (
              <div className={styles.field}>
                <label>Température (°C)</label>
                <input type="number" value={form.temperature_c}
                  onChange={e => set('temperature_c', e.target.value)} placeholder="Ex: 140" />
              </div>
            )}

            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                placeholder="Observations, incidents…" />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Annuler</button>
            <button type="submit" disabled={saving} className={styles.saveBtn}>
              {saving ? 'Enregistrement…' : existingStage ? 'Modifier' : 'Valider cette étape'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── CONDITIONING MODAL ────────────────────────── */
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
      parent_lot_id: lot.id, lot_number: finishedLotNumber,
      product_type: productCode, product_name: product.label,
      format: form.format, units_produced: parseInt(form.units_produced) || 0,
      total_weight_kg: form.total_weight_kg ? parseFloat(form.total_weight_kg) : null,
      production_date: form.production_date, ddm: form.ddm || null,
      units_remaining: parseInt(form.units_produced) || 0,
      notes: form.notes || null,
    })
    await supabase.from('lots').update({ status: 'conditionne' }).eq('id', lot.id)
    onSaved(); setSaving(false)
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
                <span style={{ fontSize: 12 }}>{pt.label}</span>
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
                onChange={e => set('units_produced', e.target.value)} placeholder="Ex: 16" />
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

/* ─── MAIN DETAIL ───────────────────────────────── */
export default function LotDetail({ lot, supabase, userId, profile, onBack, onRefresh }: {
  lot: Lot; supabase: SupabaseClient; userId: string; profile: Profile
  onBack: () => void; onRefresh: () => void
}) {
  const [openStage, setOpenStage] = useState<string | null>(null)
  const [showConditioning, setShowConditioning] = useState(false)

  const st = STATUS_CONFIG[lot.status] || STATUS_CONFIG.recu
  const variety = VARIETIES[lot.variety] || lot.variety
  const producer = PRODUCERS[lot.producer_code]
  const calibTotal = (lot.lot_calibration || []).reduce((s, c) => s + c.weight_kg, 0)

  // All stages in order — always shown
  const stageOrder = ['lavage', 'sechage', 'calibrage', 'cassage', 'torreflaction', 'presse', 'broyage']
  const stageMap = new Map((lot.lot_stages || []).map(s => [s.stage_type, s]))

  return (
    <div className={styles.detail}>
      <button className={styles.backBtn} onClick={onBack}>
        <i className="ti ti-arrow-left" /> Tous les lots
      </button>

      {/* Header */}
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
          <button className={styles.conditionBtn} onClick={() => setShowConditioning(true)}>
            <i className="ti ti-package" /> Conditionner
          </button>
        </div>
      </div>

      {/* WORKFLOW — all stages pre-defined, click to fill */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Étapes de transformation — cliquez pour renseigner</p>

        <div className={styles.workflow}>
          {/* Phase 1: Réception → Calibrage */}
          <div className={styles.workflowPhase}>
            <span className={styles.workflowPhaseLabel}>Phase 1 — Préparation</span>
            {['lavage', 'sechage', 'calibrage'].map(stageType => {
              const stage = stageMap.get(stageType)
              const config = STAGES[stageType]
              const done = !!stage
              return (
                <button key={stageType} className={`${styles.workflowStep} ${done ? styles.workflowStepDone : styles.workflowStepPending}`}
                  onClick={() => setOpenStage(stageType)}>
                  <div className={styles.wsIcon} style={{ background: done ? config.color : '#e5e2db' }}>
                    <i className={`ti ${done ? config.icon : 'ti-circle-dashed'}`}
                      style={{ color: done ? 'white' : '#aaa', fontSize: 16 }} />
                  </div>
                  <div className={styles.wsBody}>
                    <div className={styles.wsTitle}>{config.label}</div>
                    {done ? (
                      <div className={styles.wsData}>
                        <span>{fmtDate(stage!.stage_date)}</span>
                        {stage!.operator && <span>· {stage!.operator}</span>}
                        {stage!.humidity_pct_out && <span>· Hum. {stage!.humidity_pct_out}%</span>}
                        {stage!.quality_score && <span>· {'★'.repeat(stage!.quality_score)}</span>}
                        {stageType === 'calibrage' && calibTotal > 0 && <span>· {calibTotal} kg</span>}
                        {stage!.weight_out_kg && <span>· Sortie : {stage!.weight_out_kg} kg</span>}
                      </div>
                    ) : (
                      <div className={styles.wsPending}>
                        {stageType === 'lavage' ? 'Saisir la date d\'entrée' :
                         stageType === 'sechage' ? 'Saisir humidité sortie + qualité' :
                         'Saisir poids par calibre (chariot)'}
                      </div>
                    )}
                  </div>
                  <div className={styles.wsChevron}>
                    {done ? <i className="ti ti-check" style={{ color: config.color }} /> :
                             <i className="ti ti-chevron-right" style={{ color: '#ccc' }} />}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Phase 2: Transformation */}
          <div className={styles.workflowPhase}>
            <span className={styles.workflowPhaseLabel}>Phase 2 — Transformation (selon produit)</span>
            {['cassage', 'torreflaction', 'presse', 'broyage'].map(stageType => {
              const stage = stageMap.get(stageType)
              const config = STAGES[stageType]
              const done = !!stage
              return (
                <button key={stageType} className={`${styles.workflowStep} ${done ? styles.workflowStepDone : styles.workflowStepPending}`}
                  onClick={() => setOpenStage(stageType)}>
                  <div className={styles.wsIcon} style={{ background: done ? config.color : '#e5e2db' }}>
                    <i className={`ti ${done ? config.icon : 'ti-circle-dashed'}`}
                      style={{ color: done ? 'white' : '#aaa', fontSize: 16 }} />
                  </div>
                  <div className={styles.wsBody}>
                    <div className={styles.wsTitle}>{config.label}</div>
                    {done ? (
                      <div className={styles.wsData}>
                        <span>{fmtDate(stage!.stage_date)}</span>
                        {stage!.weight_in_kg && <span>· Entrée : {stage!.weight_in_kg} kg</span>}
                        {stage!.weight_out_kg && <span>· Sortie : {stage!.weight_out_kg} kg</span>}
                        {stage!.weight_in_kg && stage!.weight_out_kg && (
                          <span>· Rdt : {((stage!.weight_out_kg / stage!.weight_in_kg) * 100).toFixed(0)}%</span>
                        )}
                        {stage!.temperature_c && <span>· {stage!.temperature_c}°C</span>}
                      </div>
                    ) : (
                      <div className={styles.wsPending}>Optionnel — cliquer si applicable</div>
                    )}
                  </div>
                  <div className={styles.wsChevron}>
                    {done ? <i className="ti ti-check" style={{ color: config.color }} /> :
                             <i className="ti ti-chevron-right" style={{ color: '#ccc' }} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Calibration visual */}
      {calibTotal > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Répartition par calibre — Total {calibTotal} kg</p>
          <div className={styles.calibrationResult}>
            {(lot.lot_calibration || []).map(c => (
              <div key={c.id} className={styles.calibBar}>
                <span className={styles.calibBarLabel}>{c.caliber}</span>
                <div className={styles.calibBarTrack}>
                  <div className={styles.calibBarFill} style={{ width: `${(c.weight_kg / calibTotal) * 100}%` }} />
                </div>
                <span className={styles.calibBarValue}>{c.weight_kg} kg · {((c.weight_kg / calibTotal) * 100).toFixed(0)}%</span>
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
          <p className={styles.sectionLabel}>Notes de réception</p>
          <p className={styles.notesText}>{lot.notes}</p>
        </div>
      )}

      {/* Modals */}
      {openStage && (
        <StageFormModal
          stageType={openStage}
          existingStage={stageMap.get(openStage)}
          lot={lot} supabase={supabase} userId={userId} profile={profile}
          onSaved={() => { setOpenStage(null); onRefresh() }}
          onClose={() => setOpenStage(null)}
        />
      )}
      {showConditioning && (
        <ConditioningModal lot={lot} supabase={supabase}
          onSaved={() => { setShowConditioning(false); onRefresh() }}
          onClose={() => setShowConditioning(false)} />
      )}
    </div>
  )
}
