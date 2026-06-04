'use client'
import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Lot } from './LotsView'
import { VARIETIES, PRODUCERS, generateLotNumber } from './config'
import styles from './Lots.module.css'

interface Props {
  supabase: SupabaseClient
  userId: string
  onCreated: (lot: Lot) => void
  onCancel: () => void
}

export default function NewLotForm({ supabase, userId, onCreated, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    harvest_date: today,
    reception_date: today,
    producer_code: 'CRE',
    parcel: 'A',
    variety: 'PAU',
    humidity_pct: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const lotPreview = generateLotNumber(form.harvest_date, form.producer_code, form.parcel, form.variety)
  const hasParcels = PRODUCERS[form.producer_code]?.parcels

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase
      .from('lots')
      .insert({
        lot_number: lotPreview,
        species: 'noisette',
        variety: form.variety,
        producer_code: form.producer_code,
        parcel: hasParcels ? form.parcel : null,
        harvest_date: form.harvest_date,
        reception_date: form.reception_date,
        humidity_pct: form.humidity_pct ? parseFloat(form.humidity_pct) : null,
        status: 'recu',
        notes: form.notes || null,
        created_by: userId,
      })
      .select('*, lot_stages(*), lot_calibration(*), finished_lots(*)')
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    onCreated(data)
  }

  return (
    <div className={styles.newLotForm}>
      <div className={styles.newLotHeader}>
        <div>
          <h3>Nouveau lot</h3>
          <div className={styles.lotPreview}>N° généré : <strong>{lotPreview}</strong></div>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Date de récolte *</label>
            <input type="date" required value={form.harvest_date} onChange={e => set('harvest_date', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Date de réception *</label>
            <input type="date" required value={form.reception_date} onChange={e => set('reception_date', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Producteur *</label>
            <select value={form.producer_code} onChange={e => { set('producer_code', e.target.value); set('parcel', '') }}>
              {Object.entries(PRODUCERS).map(([code, p]) => (
                <option key={code} value={code}>{p.label}</option>
              ))}
            </select>
          </div>
          {hasParcels && (
            <div className={styles.field}>
              <label>Parcelle *</label>
              <select value={form.parcel} onChange={e => set('parcel', e.target.value)}>
                {PRODUCERS[form.producer_code].parcels!.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.field}>
            <label>Variété *</label>
            <select value={form.variety} onChange={e => set('variety', e.target.value)}>
              {Object.entries(VARIETIES).map(([code, name]) => (
                <option key={code} value={code}>{name} ({code})</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Humidité à la réception (%)</label>
            <input type="number" step="0.1" min="0" max="100"
              value={form.humidity_pct} onChange={e => set('humidity_pct', e.target.value)}
              placeholder="Ex: 18.5" />
          </div>
          <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Ex: bonne récolte, quelques feuilles…" />
          </div>
        </div>

        {error && <p className={styles.error}><i className="ti ti-alert-circle" /> {error}</p>}

        <div className={styles.formActions}>
          <button type="button" onClick={onCancel} className={styles.cancelBtn}>Annuler</button>
          <button type="submit" disabled={saving} className={styles.saveBtn}>
            {saving ? 'Création…' : 'Créer le lot'}
          </button>
        </div>
      </form>
    </div>
  )
}
