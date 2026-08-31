export const VARIETIES: Record<string, string> = {
  PAU: 'Pauetet',
  COR: 'Corabel',
  TON: 'Tonda',
  SEG: 'Segorbe',
  LEW: 'Lewis',
}

export const PRODUCERS: Record<string, { label: string; parcels?: string[] }> = {
  CRE: { label: 'Crenier (SOL)', parcels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3'] },
  JPH: { label: 'JP Hautin' },
  F3S: { label: 'Ferme des 3 soleils' },
}

// Parcelle -> variété (auto-remplissage). À compléter (B1, B2, C1, C2, C3).
export const PARCEL_VARIETY: Record<string, string> = {
  A1: 'PAU', // Pauetet
  A2: 'COR', // Corabel
}

// Calibres EN COQUE (diamètre) — et non décortiquées
export const CALIBERS = ['<13mm', '13-15mm', '16-18mm', '19-21mm', '22-24mm']

export const STAGES: Record<string, { label: string; icon: string; color: string; fields: string[] }> = {
  lavage:        { label: 'Lavage',        icon: 'ti-droplet',        color: '#185fa5', fields: ['date', 'notes'] },
  sechage:       { label: 'Séchage',       icon: 'ti-sun',            color: '#ba7517', fields: ['date', 'humidity_out', 'quality_score', 'notes'] },
  calibrage:     { label: 'Calibrage',     icon: 'ti-adjustments',    color: '#0f6e56', fields: ['date', 'calibration', 'notes'] },
  cassage:       { label: 'Cassage',       icon: 'ti-tool',           color: '#6b4fbb', fields: ['date', 'weight_in', 'weight_out', 'notes'] },
  torreflaction: { label: 'Torréfaction',  icon: 'ti-flame',          color: '#d85a30', fields: ['date', 'weight_in', 'weight_out', 'temperature_c', 'duration_min', 'notes'] },
  presse:        { label: 'Presse',        icon: 'ti-droplet',        color: '#C9A227', fields: ['date', 'weight_in', 'volume_out_l', 'weight_out', 'notes'] },
  broyage:       { label: 'Broyage',       icon: 'ti-grain',          color: '#888',    fields: ['date', 'weight_in', 'weight_out', 'notes'] },
}

export const PRODUCT_TYPES: Record<string, { label: string; code: string; formats: string[]; icon: string; color: string }> = {
  D: { label: 'Noisettes décortiquées BIO', code: 'D', formats: ['250g', '5kg', '10kg'], icon: 'ti-nut',     color: '#6b4fbb' },
  T: { label: 'Noisettes torréfiées BIO',   code: 'T', formats: ['250g', '5kg', '10kg'], icon: 'ti-flame',   color: '#d85a30' },
  P: { label: 'Poudre de noisettes BIO',    code: 'P', formats: ['250g', '5kg', '10kg'], icon: 'ti-grain',   color: '#888' },
  H: { label: 'Huile de noisettes BIO',     code: 'H', formats: ['25cl', '3L', '5L'],    icon: 'ti-droplet', color: '#C9A227' },
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; next?: string }> = {
  recu:             { label: 'Reçu',          color: '#888',    bg: '#f0ede6', next: 'lavage' },
  lavage:           { label: 'Lavage',         color: '#185fa5', bg: '#e8f4fd', next: 'seche' },
  seche:            { label: 'Séché',          color: '#ba7517', bg: '#fef3e2', next: 'calibre' },
  calibre:          { label: 'Calibré',        color: '#0f6e56', bg: '#e8f5ee', next: 'en_transformation' },
  en_transformation:{ label: 'Transformation', color: '#6b4fbb', bg: '#f0ecff', next: 'conditionne' },
  conditionne:      { label: 'Conditionné',    color: '#0f6e56', bg: '#e8f5ee', next: 'archive' },
  archive:          { label: 'Archivé',        color: '#888',    bg: '#f0ede6' },
}

export function generateLotNumber(date: string, producer: string, parcel: string, variety: string): string {
  const d = date.replace(/-/g, '')
  const parcPart = producer === 'CRE' && parcel ? `-${parcel}` : ''
  return `${d}-${producer}${parcPart}-${variety}`
}

export function generateFinishedLotNumber(parentLot: string, productCode: string): string {
  return `${parentLot}-${productCode}`
}

export function addDefaultDDM(productionDate: string): string {
  const d = new Date(productionDate)
  d.setFullYear(d.getFullYear() + 2)
  return d.toISOString().slice(0, 10)
}
