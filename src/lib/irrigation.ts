// Config partagée du module Irrigation (vue + cron de génération automatique).
// Programmes d'été, un jour sur deux. Priorité au manuel : le cron ne crée jamais
// un relevé si un relevé existe déjà pour (date, parcelle), et il est forward-only.

export interface IrrigProgram {
  key: string
  label: string
  start: string          // YYYY-MM-DD (1er passage)
  rows: { parcel: string; m3: number }[]
}

export const IRRIG_INTERVAL_DAYS = 2

// B = agrégé (396). C = ventilé : Nouveaux vergers (102) + Parcelle C (147) + Jardin (40).
export const IRRIG_PROGRAMS: IrrigProgram[] = [
  { key: 'B', label: 'Programme B', start: '2026-06-15', rows: [{ parcel: 'Programme B', m3: 396 }] },
  { key: 'C', label: 'Programme C', start: '2026-07-01', rows: [
      { parcel: 'Nouveaux vergers', m3: 102 },
      { parcel: 'C', m3: 147 },
      { parcel: 'Jardin', m3: 40 },
  ] },
]

// Parcelles individuelles (saisie manuelle libre)
export const IRRIG_PARCELS = ['A', 'B1', 'B2', 'C', 'D1', 'D2', 'E']

// Entrées à volume fixe proposées dans le menu (m³ auto-rempli)
export const IRRIG_FIXED_M3: Record<string, number> = {
  'Programme B': 396, 'Programme C': 289, 'Nouveaux vergers': 102, 'Jardin': 40,
}

// Ordre d'affichage dans le tableau/graphes
export const IRRIG_ROWS = [
  'Programme B', 'Programme C', 'Nouveaux vergers', 'Jardin',
  ...IRRIG_PARCELS,
]

export const IRRIG_COLORS: Record<string, string> = {
  'Programme B': '#0a5c47', 'Programme C': '#a84a17', 'Nouveaux vergers': '#6b4fbb', 'Jardin': '#2e8b57',
  A: '#0f6e56', B1: '#185fa5', B2: '#7ab0e0', C: '#ba7517', D1: '#b07fd0', D2: '#d6538f', E: '#d85a30',
}

// Clé locale YYYY-MM-DD d'une date
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// La date (clé) est-elle un jour de passage du programme ? (>= start, tous les 2 jours)
export function isProgramDay(prog: IrrigProgram, key: string): boolean {
  if (key < prog.start) return false
  const a = new Date(prog.start + 'T00:00:00Z').getTime()
  const b = new Date(key + 'T00:00:00Z').getTime()
  const diffDays = Math.round((b - a) / 86400000)
  return diffDays >= 0 && diffDays % IRRIG_INTERVAL_DAYS === 0
}
