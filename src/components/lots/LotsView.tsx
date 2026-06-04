'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import LotsList from './LotsList'
import LotDetail from './LotDetail'
import NewLotForm from './NewLotForm'
import styles from './Lots.module.css'

export interface Lot {
  id: string
  lot_number: string
  species: string
  variety: string
  producer_code: string
  parcel?: string
  harvest_date: string
  reception_date: string
  gross_weight_kg?: number
  humidity_pct?: number
  status: string
  notes?: string
  created_by?: string
  created_at: string
  lot_stages?: LotStage[]
  lot_calibration?: CalibrationEntry[]
  finished_lots?: FinishedLot[]
}

export interface LotStage {
  id: string
  lot_id: string
  stage_type: string
  stage_date: string
  operator?: string
  weight_in_kg?: number
  weight_out_kg?: number
  duration_min?: number
  temperature_c?: number
  humidity_pct_out?: number
  quality_score?: number
  notes?: string
  created_at: string
}

export interface CalibrationEntry {
  id: string
  lot_id: string
  caliber: string
  weight_kg: number
}

export interface FinishedLot {
  id: string
  parent_lot_id: string
  lot_number: string
  product_type: string
  product_name: string
  format: string
  units_produced: number
  total_weight_kg?: number
  production_date: string
  ddm?: string
  units_remaining?: number
  notes?: string
}

interface Props {
  supabase: SupabaseClient
  userId: string
  profile: Profile
}

export default function LotsView({ supabase, userId, profile }: Props) {
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  const [showNew, setShowNew] = useState(false)

  const loadLots = async () => {
    const { data } = await supabase
      .from('lots')
      .select('*, lot_stages(*), lot_calibration(*), finished_lots(*)')
      .order('created_at', { ascending: false })
    setLots(data || [])
    setLoading(false)
  }

  useEffect(() => { loadLots() }, [])

  const refreshLot = async (lotId: string) => {
    const { data } = await supabase
      .from('lots')
      .select('*, lot_stages(*), lot_calibration(*), finished_lots(*)')
      .eq('id', lotId)
      .single()
    if (data) {
      setSelectedLot(data)
      setLots(ls => ls.map(l => l.id === lotId ? data : l))
    }
  }

  if (selectedLot) {
    return (
      <LotDetail
        lot={selectedLot}
        supabase={supabase}
        userId={userId}
        profile={profile}
        onBack={() => setSelectedLot(null)}
        onRefresh={() => refreshLot(selectedLot.id)}
      />
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Suivi des lots — Noisettes</h2>
          <p>{lots.length} lot{lots.length > 1 ? 's' : ''} enregistré{lots.length > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/api/export/bio-register" target="_blank" className={styles.exportLinkBtn}>
            <i className="ti ti-certificate" /> Registre BIO
          </a>
          <button className={styles.newBtn} onClick={() => setShowNew(true)}>
            <i className="ti ti-plus" /> Nouveau lot
          </button>
        </div>
      </div>

      {showNew && (
        <NewLotForm
          supabase={supabase}
          userId={userId}
          onCreated={lot => { setLots(ls => [lot, ...ls]); setShowNew(false); setSelectedLot(lot) }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {loading ? (
        <div className={styles.loading}><i className="ti ti-loader" /> Chargement…</div>
      ) : (
        <LotsList lots={lots} onSelect={setSelectedLot} />
      )}
    </div>
  )
}
