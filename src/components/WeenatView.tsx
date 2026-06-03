'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './WeenatView.module.css'

const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const ReTooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface DeviceInfo {
  id: number; label: string; model: string; latest: string | null
  location?: string; depths?: number[]; metrics: string[]
}
interface WeenatSummary { weather: DeviceInfo; tensiometers: DeviceInfo[] }
interface DataPoint { datetime: string; T?: number; RR?: number; U?: number; HPOT?: number | number[]; T_CAL?: number | number[] }
interface DeviceData { device: DeviceInfo; data: DataPoint[]; period: { start: string; end: string; days: number; step: string } }

function fmtDate(d: string | null) {
  if (!d) return 'Jamais'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtTick(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function getStatus(latest: string | null): 'online' | 'recent' | 'offline' | 'unknown' {
  if (!latest) return 'unknown'
  const h = (Date.now() - new Date(latest).getTime()) / 3600000
  if (h < 3) return 'online'
  if (h < 48) return 'recent'
  return 'offline'
}
const STATUS_LABELS = { online: 'En ligne', recent: 'Récent', offline: 'Hors ligne', unknown: 'Non connecté' }
const STATUS_COLORS = { online: '#0f6e56', recent: '#ba7517', offline: '#d85a30', unknown: '#999' }
const STATUS_BG = { online: '#e8f5ee', recent: '#fef3e2', offline: '#faece7', unknown: '#f5f4f0' }

function EmptyChart() {
  return (
    <div className={styles.emptyChart}>
      <i className="ti ti-chart-line" />
      <span>Aucune donnée — matériel non connecté</span>
    </div>
  )
}

/* ─── DEVICE LIST ROW ─────────────────────────────────────────── */
function DeviceRow({ device, isWeather, onClick }: { device: DeviceInfo; isWeather?: boolean; onClick: () => void }) {
  const st = getStatus(device.latest)
  return (
    <button className={styles.row} onClick={onClick}>
      <div className={styles.rowIcon} style={{ background: isWeather ? '#e8f4fd' : '#e8f5ee' }}>
        <i className={`ti ${isWeather ? 'ti-cloud' : 'ti-chart-arrows-vertical'}`}
          style={{ color: isWeather ? '#185fa5' : '#0f6e56', fontSize: 20 }} />
      </div>
      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>{device.label}</div>
        <div className={styles.rowMeta}>
          {device.location && <span><i className="ti ti-map-pin" /> {device.location}</span>}
          {device.depths && <span><i className="ti ti-layers" /> {device.depths.join(' / ')} cm</span>}
          <span><i className="ti ti-clock" /> {fmtDate(device.latest)}</span>
        </div>
      </div>
      <div className={styles.rowRight}>
        <span className={styles.badge} style={{ color: STATUS_COLORS[st], background: STATUS_BG[st] }}>
          {STATUS_LABELS[st]}
        </span>
        <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#bbb' }} />
      </div>
    </button>
  )
}

/* ─── WEATHER DETAIL PAGE ─────────────────────────────────────── */
function WeatherPage({ device, onBack }: { device: DeviceInfo; onBack: () => void }) {
  const [data, setData] = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/weenat?type=device&id=${device.id}&days=${days}&step=day`)
      .then(r => r.json()).then((d: DeviceData) => { setData(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [device.id, days])

  const pts = data.map(d => ({ ...d, date: fmtTick(d.datetime) }))
  const st = getStatus(device.latest)

  const charts = [
    { key: 'T', label: 'Température', unit: '°C', color: '#d85a30', icon: 'ti-thermometer', ChartComp: 'line' },
    { key: 'RR', label: 'Pluviométrie', unit: ' mm', color: '#185fa5', icon: 'ti-cloud-rain', ChartComp: 'bar' },
    { key: 'U', label: 'Humidité relative', unit: '%', color: '#0f6e56', icon: 'ti-droplet', ChartComp: 'line' },
  ]

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={onBack}><i className="ti ti-arrow-left" /> Retour</button>
      <div className={styles.pageHeader}>
        <div className={styles.pageIcon} style={{ background: '#e8f4fd' }}>
          <i className="ti ti-cloud" style={{ color: '#185fa5', fontSize: 24 }} />
        </div>
        <div className={styles.pageHeaderInfo}>
          <h2>{device.label}</h2>
          <p>{device.location && <><i className="ti ti-map-pin" /> {device.location} · </>}Modèle {device.model}</p>
          <p><i className="ti ti-clock" /> Dernier relevé : {fmtDate(device.latest)}</p>
        </div>
        <span className={styles.badge} style={{ color: STATUS_COLORS[st], background: STATUS_BG[st], alignSelf: 'flex-start' }}>
          {STATUS_LABELS[st]}
        </span>
      </div>

      <div className={styles.periods}>
        {[7, 14, 30].map(d => (
          <button key={d} className={days === d ? styles.periodOn : styles.periodOff} onClick={() => setDays(d)}>{d} jours</button>
        ))}
      </div>

      {loading ? <div className={styles.loadingRow}><i className="ti ti-loader" /> Chargement…</div> : (
        <div className={styles.charts}>
          {charts.map(({ key, label, unit, color, icon, ChartComp }) => (
            <div key={key} className={styles.chartCard}>
              <div className={styles.chartHead}>
                <i className={`ti ${icon}`} style={{ color }} />
                <span>{label}</span>
              </div>
              {pts.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={180}>
                  {ChartComp === 'bar' ? (
                    <BarChart data={pts} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit={unit} />
                      <ReTooltip formatter={(v: number) => [`${v}${unit}`, label]} />
                      <Bar dataKey={key} fill={color} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={pts} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit={unit} />
                      <ReTooltip formatter={(v: number) => [`${v}${unit}`, label]} />
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── TENSIOMETER DETAIL PAGE ─────────────────────────────────── */
function TensioPage({ device, onBack }: { device: DeviceInfo; onBack: () => void }) {
  const [data, setData] = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const COLORS = ['#0f6e56', '#185fa5']
  const st = getStatus(device.latest)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/weenat?type=device&id=${device.id}&days=${days}&step=day`)
      .then(r => r.json()).then((d: DeviceData) => { setData(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [device.id, days])

  const pts = data.map(d => {
    const hpot = Array.isArray(d.HPOT) ? d.HPOT : (d.HPOT != null ? [d.HPOT] : [])
    const tCal = Array.isArray(d.T_CAL) ? d.T_CAL : (d.T_CAL != null ? [d.T_CAL] : [])
    const row: Record<string, unknown> = { date: fmtTick(d.datetime) }
    device.depths?.forEach((dep, i) => {
      row[`hpot${dep}`] = hpot[i] ?? null
      row[`t${dep}`] = tCal[i] ?? null
    })
    return row
  })

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={onBack}><i className="ti ti-arrow-left" /> Retour</button>
      <div className={styles.pageHeader}>
        <div className={styles.pageIcon} style={{ background: '#e8f5ee' }}>
          <i className="ti ti-chart-arrows-vertical" style={{ color: '#0f6e56', fontSize: 24 }} />
        </div>
        <div className={styles.pageHeaderInfo}>
          <h2>{device.label}</h2>
          <p>Modèle {device.model} · Profondeurs : {device.depths?.join(' / ')} cm</p>
          <p><i className="ti ti-clock" /> Dernier relevé : {fmtDate(device.latest)}</p>
        </div>
        <span className={styles.badge} style={{ color: STATUS_COLORS[st], background: STATUS_BG[st], alignSelf: 'flex-start' }}>
          {STATUS_LABELS[st]}
        </span>
      </div>

      <div className={styles.legend}>
        {device.depths?.map((d, i) => (
          <span key={d} className={styles.legendItem}>
            <span style={{ background: COLORS[i], width: 12, height: 3, display: 'inline-block', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            {d} cm
          </span>
        ))}
      </div>

      <div className={styles.thresholdBar}>
        <span style={{ background: '#185fa5' }} />0 cbar — Saturé
        <span style={{ background: '#0f6e56' }} />100 cbar — Optimal
        <span style={{ background: '#ba7517' }} />400 cbar — Stress modéré
        <span style={{ background: '#d85a30' }} />800 cbar — Stress sévère
      </div>

      <div className={styles.periods}>
        {[7, 14, 30].map(d => (
          <button key={d} className={days === d ? styles.periodOn : styles.periodOff} onClick={() => setDays(d)}>{d} jours</button>
        ))}
      </div>

      {loading ? <div className={styles.loadingRow}><i className="ti ti-loader" /> Chargement…</div> : (
        <div className={styles.charts}>
          <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.chartHead}>
              <i className="ti ti-water" style={{ color: '#0f6e56' }} />
              <span>Potentiel hydrique (cbar)</span>
            </div>
            {pts.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={pts} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit=" cb" />
                  <ReTooltip />
                  {device.depths?.map((dep, i) => (
                    <Line key={dep} type="monotone" dataKey={`hpot${dep}`} name={`${dep} cm`} stroke={COLORS[i]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.chartHead}>
              <i className="ti ti-thermometer" style={{ color: '#ba7517' }} />
              <span>Température du sol (°C)</span>
            </div>
            {pts.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={pts} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="°C" />
                  <ReTooltip />
                  {device.depths?.map((dep, i) => (
                    <Line key={dep} type="monotone" dataKey={`t${dep}`} name={`${dep} cm`} stroke={COLORS[i]} strokeWidth={2} dot={false} />
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

/* ─── MAIN COMPONENT ──────────────────────────────────────────── */
export default function WeenatView() {
  const [summary, setSummary] = useState<WeenatSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DeviceInfo | null>(null)

  useEffect(() => {
    fetch('/api/weenat?type=devices')
      .then(r => r.json()).then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={styles.loading}><i className="ti ti-loader" /> Chargement Weenat…</div>
  )

  if (selected) {
    if (selected.model === 'P+') return <WeatherPage device={selected} onBack={() => setSelected(null)} />
    return <TensioPage device={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><i className="ti ti-cloud-rain" /></div>
        <div>
          <h2>Irrigation — Données Weenat</h2>
          <p>7 capteurs · Ferme SOL · Cliquez sur un capteur pour voir ses données</p>
        </div>
        <a href="https://app.weenat.com" target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
          <i className="ti ti-external-link" /> Weenat
        </a>
      </div>

      {summary && (
        <>
          <p className={styles.hint}><i className="ti ti-hand-click" /> Cliquez sur un capteur pour accéder à ses graphiques</p>

          <div className={styles.listSection}>
            <p className={styles.sectionLabel}>Station météo</p>
            <DeviceRow device={summary.weather} isWeather onClick={() => setSelected(summary.weather)} />
          </div>

          <div className={styles.listSection}>
            <p className={styles.sectionLabel}>Sondes tensiométriques ({summary.tensiometers.length})</p>
            {summary.tensiometers.map(t => (
              <DeviceRow key={t.id} device={t} onClick={() => setSelected(t)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
