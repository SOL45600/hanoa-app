import { NextResponse, type NextRequest } from 'next/server'

const API_KEY = process.env.WEENAT_API_KEY!
const BASE = 'https://api.weenat.com/v3'

// Devices configuration
const WEATHER_STATION = { id: 76938, label: 'Station météo', model: 'P+' }
const TENSIOMETERS = [
  { id: 76945, label: 'Sonde CHP-30/60 A', model: 'CHP-30/60', depths: [30, 60] },
  { id: 76946, label: 'Sonde CHP-30/60 B', model: 'CHP-30/60', depths: [30, 60] },
  { id: 76943, label: 'Sonde CHP-15/30 A', model: 'CHP-15/30', depths: [15, 30] },
  { id: 76944, label: 'Sonde CHP-15/30 B', model: 'CHP-15/30', depths: [15, 30] },
  { id: 76942, label: 'Sonde CHP-15/30 C', model: 'CHP-15/30', depths: [15, 30] },
  { id: 76939, label: 'Sonde CHP-15/30 D', model: 'CHP-15/30', depths: [15, 30] },
]

async function fetchDevice(id: number) {
  const res = await fetch(`${BASE}/devices/${id}/`, {
    headers: { 'Authorization': `Weenat-Api-Key ${API_KEY}` },
    next: { revalidate: 300 }, // cache 5 min
  })
  if (!res.ok) return null
  return res.json()
}

async function fetchData(id: number, fields: string, days = 7) {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace('T', 'T').split('.')[0] + 'Z'
  const url = `${BASE}/data/devices/${id}/?time_step=day&fields=${fields}&start=${fmt(start)}&end=${fmt(end)}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Weenat-Api-Key ${API_KEY}` },
    next: { revalidate: 300 },
  })
  if (!res.ok) return []
  return res.json()
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'summary'

  if (type === 'devices') {
    // Return device metadata + latest measurement info
    const weatherDev = await fetchDevice(WEATHER_STATION.id)
    const tensioDevs = await Promise.all(TENSIOMETERS.map(t => fetchDevice(t.id)))
    return NextResponse.json({
      weather: weatherDev ? {
        ...WEATHER_STATION,
        latest: weatherDev.latest_measurement_broadcast,
        location: weatherDev.location_text,
        metrics: weatherDev.available_metrics,
      } : null,
      tensiometers: TENSIOMETERS.map((t, i) => tensioDevs[i] ? {
        ...t,
        latest: tensioDevs[i].latest_measurement_broadcast,
        metrics: tensioDevs[i].available_metrics,
      } : null).filter(Boolean),
    })
  }

  if (type === 'weather') {
    const data = await fetchData(WEATHER_STATION.id, 'T,RR,U', 30)
    return NextResponse.json({ data, device: WEATHER_STATION })
  }

  if (type === 'tensiometers') {
    const results = await Promise.all(
      TENSIOMETERS.map(async (t) => {
        const data = await fetchData(t.id, 'HPOT,T_CAL', 30)
        return { ...t, data }
      })
    )
    return NextResponse.json(results)
  }

  // Default: summary with latest readings
  const [weatherDev, ...tensioDev] = await Promise.all([
    fetchDevice(WEATHER_STATION.id),
    ...TENSIOMETERS.map(t => fetchDevice(t.id)),
  ])

  return NextResponse.json({
    weather: {
      ...WEATHER_STATION,
      latest: weatherDev?.latest_measurement_broadcast,
      location: weatherDev?.location_text,
    },
    tensiometers: TENSIOMETERS.map((t, i) => ({
      ...t,
      latest: tensioDev[i]?.latest_measurement_broadcast,
    })),
  })
}
