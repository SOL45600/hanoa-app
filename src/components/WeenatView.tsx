'use client'
import { useEffect, useState } from 'react'
import styles from './WeenatView.module.css'

interface DeviceInfo {
  id: number
  label: string
  model: string
  latest: string | null
  location?: string
  depths?: number[]
}

interface WeenatData {
  weather: DeviceInfo | null
  tensiometers: DeviceInfo[]
}

function fmtDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function StatusBadge({ latest }: { latest: string | null }) {
  if (!latest) return <span className={styles.badgeUnknown}>–</span>
  const ago = (Date.now() - new Date(latest).getTime()) / 3600000
  if (ago < 2) return <span className={styles.badgeOk}>En ligne</span>
  if (ago < 24) return <span className={styles.badgeWarn}>Récent</span>
  return <span className={styles.badgeOld}>Hors ligne</span>
}

export default function WeenatView() {
  const [data, setData] = useState<WeenatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/weenat?type=devices')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Impossible de contacter l\'API Weenat'); setLoading(false) })
  }, [])

  if (loading) return (
    <div className={styles.loading}>
      <i className="ti ti-loader" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }} />
      <span>Chargement des données Weenat…</span>
    </div>
  )

  if (error) return (
    <div className={styles.error}>
      <i className="ti ti-alert-circle" />
      <span>{error}</span>
    </div>
  )

  if (!data) return null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><i className="ti ti-cloud-rain" /></div>
        <div>
          <h2>Données irrigation — Weenat</h2>
          <p>7 capteurs · Ferme SOL</p>
        </div>
        <a
          href="https://app.weenat.com"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkBtn}
        >
          <i className="ti ti-external-link" /> Ouvrir Weenat
        </a>
      </div>

      {/* Station météo */}
      {data.weather && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Station météo</p>
          <div className={styles.card}>
            <div className={styles.cardIcon} style={{ background: '#e8f4fd' }}>
              <i className="ti ti-thermometer" style={{ color: '#185fa5', fontSize: 22 }} />
            </div>
            <div className={styles.cardInfo}>
              <div className={styles.cardTitle}>{data.weather.label}</div>
              <div className={styles.cardSub}>
                {data.weather.location && <span><i className="ti ti-map-pin" /> {data.weather.location}</span>}
                <span><i className="ti ti-clock" /> Dernier relevé : {fmtDate(data.weather.latest)}</span>
              </div>
              <div className={styles.metrics}>
                <span className={styles.metric}><i className="ti ti-thermometer" /> Température</span>
                <span className={styles.metric}><i className="ti ti-droplet" /> Pluviométrie</span>
                <span className={styles.metric}><i className="ti ti-wind" /> Humidité</span>
              </div>
            </div>
            <StatusBadge latest={data.weather.latest} />
          </div>
        </div>
      )}

      {/* Sondes tensiométriques */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Sondes tensiométriques ({data.tensiometers.length})</p>
        <div className={styles.grid}>
          {data.tensiometers.map(t => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardIcon} style={{ background: '#e8f5ee' }}>
                <i className="ti ti-chart-arrows-vertical" style={{ color: '#0f6e56', fontSize: 22 }} />
              </div>
              <div className={styles.cardInfo}>
                <div className={styles.cardTitle}>{t.label}</div>
                <div className={styles.cardSub}>
                  <span><i className="ti ti-layers" /> Profondeurs : {t.depths?.join(' cm / ')} cm</span>
                  <span><i className="ti ti-clock" /> {fmtDate(t.latest)}</span>
                </div>
                <div className={styles.metrics}>
                  <span className={styles.metric}><i className="ti ti-water" /> Potentiel hydrique (cbar)</span>
                  <span className={styles.metric}><i className="ti ti-thermometer" /> Temp. sol</span>
                </div>
              </div>
              <StatusBadge latest={t.latest} />
            </div>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        <i className="ti ti-info-circle" /> Les graphiques détaillés seront disponibles dès que les capteurs auront transmis suffisamment de données historiques.
      </p>
    </div>
  )
}
