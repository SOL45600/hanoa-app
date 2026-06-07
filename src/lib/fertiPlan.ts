// Calendrier ferti-phyto — source unique partagée par le Planning (CalendarView)
// et le cron (/api/cron/planning). month: 0=janvier. row: ligne du planning.
// Dates indicatives (stades phéno mappés à des mois) — À VALIDER selon la saison.

export interface FertiPlanItem { month: number; row: string; title: string }

const R = 'vergers_ferti_phyto'

export const FERTI_PLAN: FertiPlanItem[] = [
  // ── Calendrier mutualisé (fertilisation, toutes parcelles / E / D2+D1) ──
  { month: 5, row: R, title: '1er foliaire Zn+B — toutes parcelles (Actiflow Zn680 + Solubor DF)' },
  { month: 5, row: R, title: 'Magprill 500–600 kg/ha — E (pacaniers) puis irriguer' },
  { month: 5, row: R, title: 'Patentkali — D2 (~250) + D1 (~200 kg/ha)' },
  { month: 6, row: R, title: '2e foliaire Zn+B — toutes parcelles + analyses foliaires' },
  { month: 7, row: R, title: 'Appoint Mg foliaire (sels d\'Epsom) si jaunissement — toutes parcelles' },
  { month: 8, row: R, title: 'Apports d\'automne : Phosphore + matière organique — D2 + D1' },
  { month: 8, row: R, title: 'Patentkali 2e moitié + D1 protection gel' },
  { month: 8, row: R, title: 'Magprill 2e passage (selon analyse) — E (pacaniers)' },

  // ── Détail par stade — Amandiers (D2) : phyto/protection ──
  { month: 1, row: R, title: 'BB RSR (bouillie bordelaise) — Amandiers D2 (dormance → débourrement)' },
  { month: 2, row: R, title: 'BB RSR — Amandiers D2 (pointes vertes → boutons)' },
  { month: 2, row: R, title: 'Curatio (soufre) — Amandiers D2 (pré-floraison)' },
  { month: 3, row: R, title: 'Champ Flo — Amandiers D2 (chute des pétales)' },
  { month: 4, row: R, title: 'Kaolin anti-capricorne — Amandiers D2 (1er vol, renouveler après pluie >15mm)' },
  { month: 6, row: R, title: 'Calciblanc (film protecteur) — Amandiers D2 (été, coups de chaud)' },
  { month: 10, row: R, title: 'Champ Flo — Amandiers D2 (50% chute des feuilles)' },

  // ── Détail par stade — Pacaniers (E) : phyto/protection ──
  { month: 3, row: R, title: 'Champ Flo — Pacaniers E (débourrement → jeunes feuilles)' },
  { month: 4, row: R, title: 'Kaolin anti-capricorne — Pacaniers E (mai→juillet, renouveler)' },
  { month: 5, row: R, title: 'Calciblanc (barrière minérale) — Pacaniers E (début été)' },
  { month: 6, row: R, title: 'Calciblanc 2e passage — Pacaniers E (été, maintien couverture)' },
]
