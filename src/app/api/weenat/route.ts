import { NextResponse, type NextRequest } from 'next/server'

const API_KEY = process.env.WEENAT_API_KEY!
const BASE = 'https://api.weenat.com/v3'

const DEVICES = {
  weather: { id: 76938, label: 'Station météo', model: 'P+', metrics: ['T', 'RR', 'U', 'THI'] },
  // Labels vérifiés via numéro de série Weenat (2026-07) : parcelle réelle de chaque sonde.
  tensiometers: [
    { id: 76943, label: 'Sonde B15', parcel: 'B', serial: 'X800D20', model: 'CHP-15/30', depths: [15, 30], metrics: ['HPOT', 'T_CAL'] },
    { id: 76946, label: 'Sonde B30', parcel: 'B', serial: 'X800AAB', model: 'CHP-30/60', depths: [30, 60], metrics: ['HPOT', 'T_CAL'] },
    { id: 76942, label: 'Sonde C15', parcel: 'C', serial: 'X800D25', model: 'CHP-15/30', depths: [15, 30], metrics: ['HPOT', 'T_CAL'] },
    { id: 76939, label: 'Sonde D15', parcel: 'D', serial: 'X800D1D', model: 'CHP-15/30', depths: [15, 30], metrics: ['HPOT', 'T_CAL'] },
    { id: 76945, label: 'Sonde D30', parcel: 'D', serial: 'X800A8E', model: 'CHP-30/60', depths: [30, 60], metrics: ['HPOT', 'T_CAL'] },
    { id: 76944, label: 'Sonde E15', parcel: 'E', serial: 'X800D21', model: 'CHP-15/30', depths: [15, 30], metrics: ['HPOT', 'T_CAL'] },
  ],
}

async function weenatFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Weenat-Api-Key ${API_KEY}` },
    next: { revalidate: 300 },
  })
  if (!res.ok) return null
  return res.json()
}

function dateRange(days: number) {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  const fmt = (d: Date) => d.toISOString().split('.')[0] + 'Z'
  return { start: fmt(start), end: fmt(end) }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') || 'summary'
  const deviceId = searchParams.get('id')
  const days = parseInt(searchParams.get('days') || '30')
  const step = searchParams.get('step') || 'hour'

  // Device info only
  if (type === 'devices') {
    const [weatherDev, ...tensioDev] = await Promise.all([
      weenatFetch(`/devices/${DEVICES.weather.id}/`),
      ...DEVICES.tensiometers.map(t => weenatFetch(`/devices/${t.id}/`)),
    ])
    return NextResponse.json({
      weather: {
        ...DEVICES.weather,
        latest: weatherDev?.latest_measurement_broadcast,
        location: weatherDev?.location_text,
      },
      tensiometers: DEVICES.tensiometers.map((t, i) => ({
        ...t,
        latest: tensioDev[i]?.latest_measurement_broadcast,
      })),
    })
  }

  // TEMP: objet device brut complet (inspecter un champ nom éventuel)
  if (type === 'raw') {
    const raw = await weenatFetch(`/devices/${deviceId || DEVICES.tensiometers[0].id}/`)
    return NextResponse.json(raw)
  }

  // Plots (parcels) with GeoJSON
  if (type === 'plots') {
    const data = await weenatFetch('/plots/')
    if (!data?.results) return NextResponse.json([])
    return NextResponse.json(data.results.map((p: {
      id: number; name: string; location: [number, number]; location_text: string; geojson: object
    }) => ({
      id: p.id,
      name: p.name,
      center: p.location, // [lat, lng]
      location_text: p.location_text,
      geojson: p.geojson,
    })))
  }

  // Single device data with time series
  if (type === 'device' && deviceId) {
    const id = parseInt(deviceId)
    const allDevices = [DEVICES.weather, ...DEVICES.tensiometers]
    const device = allDevices.find(d => d.id === id)
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const { start, end } = dateRange(days)
    const fields = device.metrics.join(',')
    const [info, data] = await Promise.all([
      weenatFetch(`/devices/${id}/`),
      weenatFetch(`/data/devices/${id}/?time_step=${step}&fields=${fields}&start=${start}&end=${end}`),
    ])

    return NextResponse.json({
      device: { ...device, latest: info?.latest_measurement_broadcast, location: info?.location_text },
      data: data || [],
      period: { start, end, days, step },
    })
  }

  // Weather station data
  if (type === 'weather') {
    const { start, end } = dateRange(days)
    const data = await weenatFetch(
      `/data/devices/${DEVICES.weather.id}/?time_step=${step}&fields=T,RR,U&start=${start}&end=${end}`
    )
    return NextResponse.json({ data: data || [], period: { start, end } })
  }

  // All tensiometers data
  if (type === 'tensiometers') {
    const { start, end } = dateRange(days)
    const results = await Promise.all(
      DEVICES.tensiometers.map(async (t) => {
        const data = await weenatFetch(
          `/data/devices/${t.id}/?time_step=${step}&fields=HPOT,T_CAL&start=${start}&end=${end}`
        )
        return { ...t, data: data || [] }
      })
    )
    return NextResponse.json(results)
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
