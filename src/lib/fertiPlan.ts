// Calendrier ferti-phyto — source unique partagée par le Planning (CalendarView)
// et le cron (/api/cron/planning). month: 0=janvier. row: ligne du planning.
// Basé sur : Plan ferti-phyto Noisetiers 2026 (A/B1/B2/C) + Jeunes vergers (D1 yuzu,
// D2 amandiers, E pacaniers). Dates = stades phéno mappés aux mois — À VALIDER.

export interface FertiPlanItem { month: number; row: string; title: string }

const F = 'vergers_ferti_phyto'
const E = 'vergers_entretien'

export const FERTI_PLAN: FertiPlanItem[] = [
  /* ───────────── NOISETIERS (A · B1 · B2 · C) ───────────── */
  // Amendement (automne / sortie hiver + printemps)
  { month: 9,  row: F, title: "Noisetiers — Chaulage EFFICAP sur A & C (acides) + Ferti Gypse 400 kg/ha (4 parcelles)" },
  { month: 2,  row: F, title: "Noisetiers — Kiésérite (Mg) B1/B2 + Patentkali — printemps, sur le rang" },
  // Phytosanitaire & foliaire (version allégée)
  { month: 2,  row: F, title: "Noisetiers — Champflo (cuivre) 1 L/ha + Argibio 30 kg/ha — débourrement (anthracnose)" },
  { month: 2,  row: F, title: "Noisetiers — Héliosoufre 2 L/ha — phytopte (fenêtre de migration)" },
  { month: 3,  row: F, title: "Noisetiers — BT 1 kg/ha — chenille / zeuzère (C1–C3, avril)" },
  { month: 4,  row: F, title: "Noisetiers — Clé'Flo 10 L/ha — balanin (ravageur majeur, mai)" },
  { month: 5,  row: F, title: "Noisetiers — Héliosoufre 2 L/ha + Clé'Flo 10 L/ha — phytopte / balanin (juin)" },
  { month: 5,  row: F, title: "Noisetiers — Borozinc 4 kg/ha (Zn+B) — renforcer sur B2 & C" },
  { month: 5,  row: F, title: "Noisetiers — Epsotop 8 kg/ha (Mg) — 1er passage (juin)" },
  { month: 5,  row: F, title: "Noisetiers — Dentamet 3 L/ha — punaise (larve)" },
  { month: 6,  row: F, title: "Noisetiers — Epsotop 8 kg/ha (Mg) — 2e passage (juillet)" },
  { month: 7,  row: F, title: "Noisetiers — Clé'Flo 10 L/ha + Dentamet 3 L/ha — capricorne / punaise adulte (août)" },
  { month: 8,  row: F, title: "Noisetiers — BT 1 kg/ha — chenilles diverses (sept.)" },
  { month: 10, row: F, title: "Noisetiers — Cuivre (Champflo) — chute des feuilles / post-récolte (anthracnose, 1er passage)" },

  /* ───────────── JEUNES VERGERS (D1 yuzu · D2 amandiers · E pacaniers) ───────────── */
  // Amendement (automne / sortie hiver + printemps)
  { month: 9,  row: F, title: "Jeunes vergers — Chaulage Omya Magprill — Pécan E (fractionné ~1,4 t/ha) + D1 léger" },
  { month: 2,  row: F, title: "Jeunes vergers — Kiésérite (Mg) D2 + Patentkali D2/D1 — printemps, sur le rang" },
  // Foliaires mutualisés (toutes parcelles jeunes vergers)
  { month: 5,  row: F, title: "Jeunes vergers — 1er foliaire Zn+B (Actiflow Zn680 + Solubor DF) — toutes parcelles" },
  { month: 6,  row: F, title: "Jeunes vergers — 2e foliaire Zn+B + analyses foliaires" },
  { month: 7,  row: F, title: "Jeunes vergers — Appoint Mg foliaire (sels d'Epsom) si jaunissement" },
  { month: 8,  row: F, title: "Jeunes vergers — Apports d'automne : Phosphore + matière organique (D2 + D1)" },
  // Amandiers (D2) — phyto par stade
  { month: 1,  row: F, title: "Amandiers D2 — BB RSR (bouillie bordelaise) — dormance → débourrement" },
  { month: 2,  row: F, title: "Amandiers D2 — BB RSR — pointes vertes → boutons" },
  { month: 2,  row: F, title: "Amandiers D2 — Curatio (soufre) — pré-floraison" },
  { month: 3,  row: F, title: "Amandiers D2 — Champ Flo — chute des pétales" },
  { month: 4,  row: F, title: "Amandiers D2 — Kaolin anti-capricorne (1er vol, renouveler après pluie >15mm)" },
  { month: 6,  row: F, title: "Amandiers D2 — Calciblanc (film protecteur) — été, coups de chaud" },
  { month: 10, row: F, title: "Amandiers D2 — Champ Flo — 50% chute des feuilles" },
  // Pacaniers (E) — phyto par stade
  { month: 3,  row: F, title: "Pacaniers E — Champ Flo — débourrement → jeunes feuilles" },
  { month: 4,  row: F, title: "Pacaniers E — Kaolin anti-capricorne (mai→juillet, renouveler)" },
  { month: 5,  row: F, title: "Pacaniers E — Calciblanc (barrière minérale) — début été" },
  { month: 6,  row: F, title: "Pacaniers E — Calciblanc 2e passage — été" },
  { month: 8,  row: F, title: "Pacaniers E — Magprill 2e passage (selon analyse)" },

  /* ───────────── ENTRETIEN — Taille & Broyage (indicatif, à valider) ───────────── */
  { month: 0, row: E, title: "Taille d'hiver (repos végétatif) — toutes parcelles" },
  { month: 1, row: E, title: "Fin de taille + broyage des bois de taille" },
  { month: 4, row: E, title: "Drageonnage (suppression des rejets) — noisetiers" },
  { month: 5, row: E, title: "Drageonnage — 2e passage" },
  { month: 3, row: E, title: "Broyage inter-rang — 1er passage de printemps" },
  { month: 4, row: E, title: "Broyage inter-rang" },
  { month: 5, row: E, title: "Broyage inter-rang" },
  { month: 6, row: E, title: "Broyage inter-rang (selon pousse)" },
  { month: 8, row: E, title: "Broyage avant récolte / nettoyage du sol" },
]
