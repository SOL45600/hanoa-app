'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './WeenatView.module.css'

// Lazy-load recharts to avoid SSR issues
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface DeviceInfo {
  id: number
  label: string
  model: string
  latest: string | null
  location?: string
  depths?: number[]
  metrics: string[]
}

interface WeenatSummary {
  weather: DeviceInfo
  tensiometers: DeviceInfo[]
}

interface DataPoint {
  datetime: string
  T?: number
  RR?: number
  U?: number
  HPOT?: number | number[]
  T_CAL?: number | number[]
  THI?: number
}

interface DeviceData {
  device: DeviceInfo
  data: DataPoint[]
  period: { start: string; end: string; days: number; step: string }
}

type View = 'summary' | 'device'

function fmtDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtTick(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function StatusBadge({ latest }: { latest: string | null }) {
  if (!latest) return <span className={styles.badgeUnknown}>Non connecté</span>
  const ago = (Date.now() - new Date(latest).getTime()) / 3600000
  if (ago < 3) return <span className={styles.badgeOk}>En ligne</span>
  if (ago < 48) return <span className={styles.badgeWarn}>Récent</span>
  return <span className={styles.badgeOld}>Hors ligne</span>
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className={styles.emptyChart}>
      <i className="ti ti-chart-line" style={{ fontSize: 32, color: '#d3d1c7' }} />
      <p>{message}</p>
    </div>
  )
}

function WeatherDevicePage({ device, onBack }: { device: DeviceInfo; onBack: () => void }) {
  const [data, setData] = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/weenat?type=device&id=${device.id}&days=${days}&step=day`)
      .then(r => r.json())
      .then((d: DeviceData) => { setData(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [device.id, days])

  const formatted = data.map(d => ({ ...d, date: fmtTick(d.datetime) }))

  return (
    <div className={styles.devicePage}>
      <button className={styles.backBtn} onClick={onBack}>
        <i className="ti ti-arrow-left" /> Retour
      </button>

      <div className={styles.deviceHeader}>
        <div className={styles.deviceHeaderIcon} style={{ background: '#e8f4fd' }}>
          <i className="ti ti-cloud" style={{ color: '#185fa5', fontSize: 24 }} />
        </div>
        <div>
          <h2>{device.label}</h2>
          <p>Modèle {device.model}{device.location ? ` · ${device.location}` : ''}</p>
          <p>Dernier relevé : {fmtDate(device.latest)}</p>
        </div>
        <StatusBadge latest={device.latest} />
      </div>

      <div className={styles.periodSelector}>
        {[7, 14, 30].map(d => (
          <button key={d} className={days === d ? styles.periodActive : styles.periodBtn} onClick={() => setDays(d)}>
            {d}j
          </button>
        ))}
      </div>

      {loading && <div className={styles.loadingMsg}><i className="ti ti-loader" /> Chargement…</div>}

      {!loading && (
        <div className={styles.chartsGrid}>
          {/* Température */}
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>
              <i className="ti ti-thermometer" style={{ color: '#d85a30' }} />
              Température (°C)
            </div>
            {formatted.length === 0 ? (
              <EmptyChart message="Aucune donnée — matériel non connecté" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={formatted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="°C" />
                  <Tooltip formatter={(v: number) => [`${v}°C`, 'Température']} />
                  <Line type="monotone" dataKey="T" stroke="#d85a30" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pluviométrie */}
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>
              <i className="ti ti-cloud-rain" style={{ color: '#185fa5' }} />
              Pluviométrie (mm)
            </div>
            {formatted.length === 0 ? (
              <EmptyChart message="Aucune donnée — matériel non connecté" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={formatted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="mm" />
                  <Tooltip formatter={(v: number) => [`${v} mm`, 'Pluie']} />
                  <Bar dataKey="RR" fill="#185fa5" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Humidité */}
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>
              <i className="ti ti-droplet" style={{ color: '#0f6e56' }} />
              Humidité relative (%)
            </div>
            {formatted.length === 0 ? (
              <EmptyChart message="Aucune donnée — matériel non connecté" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={formatted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Humidité']} />
                  <Line type="monotone" dataKey="U" stroke="#0f6e56" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TensiometerPage({ device, onBack }: { device: DeviceInfo; onBack: () => void }) {
  const [data, setData] = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/weenat?type=device&id=${device.id}&days=${days}&step=day`)
      .then(r => r.json())
      .then((d: DeviceData) => { setData(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [device.id, days])

  // Hydric potential thresholds (cbar)
  const THRESHOLDS = [
    { value: 0, label: 'Saturé', color: '#185fa5' },
    { value: 100, label: 'Optimal', color: '#0f6e56' },
    { value: 400, label: 'Stress modéré', color: '#ba7517' },
    { value: 800, label: 'Stress sévère', color: '#d85a30' },
  ]

  const formatted = data.map(d => {
    const hpot = Array.isArray(d.HPOT) ? d.HPOT : [d.HPOT]
    const tCal = Array.isArray(d.T_CAL) ? d.T_CAL : [d.T_CAL]
    const result: Record<string, unknown> = { date: fmtTick(d.datetime) }
    hpot.forEach((v, i) => { result[`hpot_${device.depths?.[i] ?? i * 15 + 15}cm`] = v })
    tCal.forEach((v, i) => { result[`tCal_${device.depths?.[i] ?? i * 15 + 15}cm`] = v })
    return result
  })

  const COLORS = ['#0f6e56', '#185fa5', '#ba7517', '#d85a30']

  return (
    <div className={styles.devicePage}>
      <button className={styles.backBtn} onClick={onBack}>
        <i className="ti ti-arrow-left" /> Retour
      </button>

      <div className={styles.deviceHeader}>
        <div className={styles.deviceHeaderIcon} style={{ background: '#e8f5ee' }}>
          <i className="ti ti-chart-arrows-vertical" style={{ color: '#0f6e56', fontSize: 24 }} />
        </div>
        <div>
          <h2>{device.label}</h2>
          <p>Modèle {device.model} · Profondeurs : {device.depths?.join(' cm / ')} cm</p>
          <p>Dernier relevé : {fmtDate(device.latest)}</p>
        </div>
        <StatusBadge latest={device.latest} />
      </div>

      {/* Threshold legend */}
      <div className={styles.thresholds}>
        {THRESHOLDS.map(t => (
          <div key={t.value} className={styles.threshold}>
            <span style={{ background: t.color }} className={styles.thresholdDot} />
            <span>{t.value > 0 ? `> ${t.value} cbar` : '0 cbar'}</span>
            <span className={styles.thresholdLabel}>{t.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.periodSelector}>
        {[7, 14, 30].map(d => (
          <button key={d} className={days === d ? styles.periodActive : styles.periodBtn} onClick={() => setDays(d)}>
            {d}j
          </button>
        ))}
      </div>

      {loading && <div className={styles.loadingMsg}><i className="ti ti-loader" /> Chargement…</div>}

      {!loading && (
        <div className={styles.chartsGrid}>
          {/* Potentiel hydrique */}
          <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.chartTitle}>
              <i className="ti ti-water" style={{ color: '#0f6e56' }} />
              Potentiel hydrique (cbar) — par profondeur
            </div>
            {formatted.length === 0 ? (
              <EmptyChart message="Aucune donnée — matériel non connecté" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={formatted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" cb" />
                  <Tooltip />
                  {device.depths?.map((depth, i) => (
                    <Line
                      key={depth}
                      type="monotone"
                      dataKey={`hpot_${depth}cm`}
                      name={`${depth} cm`}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Température du sol */}
          <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.chartTitle}>
              <i className="ti ti-thermometer" style={{ color: '#ba7517' }} />
              Température du sol (°C)
            </div>
            {formatted.length === 0 ? (
              <EmptyChart message="Aucune donnée — matériel non connecté" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={formatted}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="°C" />
                  <Tooltip formatter={(v: number) => [`${v}°C`, 'T°sol']} />
                  {device.depths?.map((depth, i) => (
                    <Line
                      key={depth}
                      type="monotone"
                      dataKey={`tCal_${depth}cm`}
                      name={`${depth} cm`}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WeenatView() {
  const [summary, setSummary] = useState<WeenatSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('summary')
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null)

  useEffect(() => {
    fetch('/api/weenat?type=devices')
      .then(r => r.json())
      .then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const openDevice = (device: DeviceInfo) => {
    setSelectedDevice(device)
    setView('device')
  }

  const backToSummary = () => {
    setView('summary')
    setSelectedDevice(null)
  }

  if (loading) return (
    <div className={styles.loading}>
      <i className="ti ti-loader" style={{ fontSize: 20 }} />
      <span>Chargement Weenat…</span>
    </div>
  )

  // Device detail view
  if (view === 'device' && selectedDevice) {
    if (selectedDevice.model === 'P+') {
      return <WeatherDevicePage device={selectedDevice} onBack={backToSummary} />
    }
    return <TensiometerPage device={selectedDevice} onBack={backToSummary} />
  }

  // Summary view
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><i className="ti ti-cloud-rain" /></div>
        <div>
          <h2>Irrigation — Données Weenat</h2>
          <p>7 capteurs · Ferme SOL · Lion-en-Sullias</p>
        </div>
        <a href="https://app.weenat.com" target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
          <i className="ti ti-external-link" /> Ouvrir Weenat
        </a>
      </div>

      {summary && (
        <>
          {/* Station météo */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Station météo</p>
            <button className={styles.deviceCard} onClick={() => openDevice(summary.weather)}>
              <div className={styles.cardIcon} style={{ background: '#e8f4fd' }}>
                <i className="ti ti-cloud" style={{ color: '#185fa5', fontSize: 22 }} />
              </div>
              <div className={styles.cardInfo}>
                <div className={styles.cardTitle}>{summary.weather.label}</div>
                <div className={styles.cardSub}>
                  {summary.weather.location && <span><i className="ti ti-map-pin" /> {summary.weather.location}</span>}
                  <span><i className="ti ti-clock" /> {fmtDate(summary.weather.latest)}</span>
                </div>
                <div className={styles.metrics}>
                  <span className={styles.metric}><i className="ti ti-thermometer" /> Température</span>
                  <span className={styles.metric}><i className="ti ti-cloud-rain" /> Pluviométrie</span>
                  <span className={styles.metric}><i className="ti ti-droplet" /> Humidité</span>
                </div>
              </div>
              <div className={styles.cardRight}>
                <StatusBadge latest={summary.weather.latest} />
                <span className={styles.seeBtn}>Voir les données <i className="ti ti-chevron-right" /></span>
              </div>
            </button>
          </div>

          {/* Tensiomètres */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Sondes tensiométriques ({summary.tensiometers.length})</p>
            <div className={styles.grid}>
              {summary.tensiometers.map(t => (
                <button key={t.id} className={styles.deviceCard} onClick={() => openDevice(t)}>
                  <div className={styles.cardIcon} style={{ background: '#e8f5ee' }}>
                    <i className="ti ti-chart-arrows-vertical" style={{ color: '#0f6e56', fontSize: 20 }} />
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardTitle}>{t.label}</div>
                    <div className={styles.cardSub}>
                      <span><i className="ti ti-layers" /> {t.depths?.join(' / ')} cm</span>
                      <span><i className="ti ti-clock" /> {fmtDate(t.latest)}</span>
                    </div>
                    <div className={styles.metrics}>
                      <span className={styles.metric}>Potentiel hydrique</span>
                      <span className={styles.metric}>T° sol</span>
                    </div>
                  </div>
                  <div className={styles.cardRight}>
                    <StatusBadge latest={t.latest} />
                    <span className={styles.seeBtn}>Voir <i className="ti ti-chevron-right" /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
