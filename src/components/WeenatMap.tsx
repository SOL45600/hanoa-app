'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './WeenatMap.module.css'

interface Plot {
  id: number
  name: string
  center: [number, number] // [lat, lng]
  location_text: string
  geojson: {
    type: string
    coordinates: number[][][]
  }
}

const COLORS = ['#0f6e56', '#185fa5', '#ba7517', '#d85a30']

export default function WeenatMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [plots, setPlots] = useState<Plot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mapInstance = useRef<unknown>(null)

  useEffect(() => {
    fetch('/api/weenat?type=plots')
      .then(r => r.json())
      .then(d => { setPlots(d); setLoading(false) })
      .catch(() => { setError('Impossible de charger les parcelles'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!mapRef.current || plots.length === 0 || mapInstance.current) return

    // Dynamic import to avoid SSR issues
    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      // Fix default icon issue with Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const center: [number, number] = [
        plots.reduce((s, p) => s + p.center[0], 0) / plots.length,
        plots.reduce((s, p) => s + p.center[1], 0) / plots.length,
      ]

      const map = L.map(mapRef.current!).setView(center, 14)
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map)

      plots.forEach((plot, i) => {
        const color = COLORS[i % COLORS.length]
        // Convert GeoJSON coordinates [lng, lat] → Leaflet [lat, lng]
        const latlngs = plot.geojson.coordinates[0].map(
          ([lng, lat]: number[]) => [lat, lng] as [number, number]
        )
        L.polygon(latlngs, {
          color,
          fillColor: color,
          fillOpacity: 0.2,
          weight: 2,
        }).addTo(map).bindPopup(`<strong>${plot.name}</strong><br/>${plot.location_text}`)

        // Label marker
        L.marker(plot.center, {
          icon: L.divIcon({
            html: `<div style="
              background:${color};color:white;padding:3px 8px;border-radius:12px;
              font-size:12px;font-weight:600;white-space:nowrap;
              box-shadow:0 1px 4px rgba(0,0,0,0.3)
            ">${plot.name}</div>`,
            className: '',
            iconAnchor: [40, 12],
          }),
        }).addTo(map)
      })
    })

    return () => {
      if (mapInstance.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapInstance.current as any).remove()
        mapInstance.current = null
      }
    }
  }, [plots])

  if (loading) return (
    <div className={styles.placeholder}>
      <i className="ti ti-loader" style={{ fontSize: 20 }} /> Chargement de la carte…
    </div>
  )
  if (error) return (
    <div className={styles.placeholder} style={{ color: '#d85a30' }}>
      <i className="ti ti-alert-circle" /> {error}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className={styles.map} />
      <div className={styles.legend}>
        {plots.map((p, i) => (
          <span key={p.id} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: COLORS[i % COLORS.length] }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}
