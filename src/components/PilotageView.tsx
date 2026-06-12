'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'

/* ───────── Snapshot P&L (PREV_Hanoa_071025.xlsx — BUDGET CASH FLOW) ─────────
   À ré-importer si tu mets à jour ton Excel maître. */
const PL_YEARS = ['25-26','26-27','27-28','28-29','29-30','30-31','31-32','32-33','33-34','34-35','35-36','36-37','37-38']
const PL_CA  = [220028,456602,807170,1164478,1542839,1753607,2013267,2028294,2044823,2063006,2063006,1437606,1437606]
const PL_RN  = [-9996,-50472,31755,80618,167755,176531,210156,201165,205233,209694,225985,-250233,-238144]
const PL_EBE = [7026,-3145,83971,147698,263122,274039,318063,305243,309806,314868,335676,-278632,-279631]
const PL_CFC = [29076,65389,101760,186993,359364,540511,755282,961063,1170911,1385220,1615820,1346875,1075768]

/* ───────── Hypothèses unit-economics (modifiables) ───────── */
const DEFAULTS = {
  prixCoque: 4,        // €/kg noisettes en coque
  rendement: 0.40,     // rendement cassage (décortiqué / coque)
  pertTorr: 0.08,      // perte poids torréfaction (~8 %)
  pvcDec: 14.5,        // €/kg décortiquées
  pvcTorr: 17,         // €/kg torréfiées
  pvcSachet: 16,       // €/kg équivalent sachet 50 g
  embSachet: 0.20,     // €/sachet de 50 g (→ /kg = ×20)
}

function fmt(n: number, d = 2) { return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtEur0(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) }

/** couleur marge % : rouge (≤0) → orange → vert */
function margeColor(pct: number) {
  if (pct <= 0) return '#c0392b'
  if (pct < 0.10) return '#e67e22'
  if (pct < 0.25) return '#f1c40f'
  if (pct < 0.40) return '#7fb069'
  return '#0f6e56'
}

export default function PilotageView({ supabase, profile }: { supabase: SupabaseClient; profile: Profile }) {
  const [p, setP] = useState(DEFAULTS)
  const [realYield, setRealYield] = useState<{ avg: number; n: number; min: number; max: number } | null>(null)

  // Rendement réel observé sur les lots (cassage)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('lot_stages')
        .select('weight_in_kg, weight_out_kg, weight_out_eclats_kg')
        .eq('stage_type', 'cassage')
      const ys: number[] = []
      for (const s of (data || [])) {
        const inKg = Number(s.weight_in_kg) || 0
        const out = (Number(s.weight_out_kg) || 0) + (Number(s.weight_out_eclats_kg) || 0)
        if (inKg > 0 && out > 0) ys.push(out / inKg)
      }
      if (ys.length) setRealYield({
        avg: ys.reduce((a, b) => a + b, 0) / ys.length,
        n: ys.length, min: Math.min(...ys), max: Math.max(...ys),
      })
    })()
  }, [supabase])

  // Calculs dérivés
  const cdrDec = p.prixCoque / p.rendement
  const cdrTorr = cdrDec / (1 - p.pertTorr)
  const cdrSachet = cdrDec + p.embSachet * 20 // 50 g → 20 sachets/kg

  const products = useMemo(() => ([
    { key: 'dec', nom: 'Décortiquées', pvc: p.pvcDec, cdr: cdrDec },
    { key: 'torr', nom: 'Torréfiées', pvc: p.pvcTorr, cdr: cdrTorr },
    { key: 'sachet', nom: 'Sachet 50 g', pvc: p.pvcSachet, cdr: cdrSachet },
  ].map(x => ({ ...x, marge: x.pvc - x.cdr, pct: (x.pvc - x.cdr) / x.pvc }))), [p, cdrDec, cdrTorr, cdrSachet])

  // Heatmap : prix achat (cols) × rendement (rows) → marge €/kg décortiqué
  const COQUE_RANGE = [3, 3.25, 3.5, 3.75, 4]
  const REND_RANGE = [0.30, 0.325, 0.35, 0.375, 0.40]
  const [hmProduct, setHmProduct] = useState<'dec' | 'torr' | 'sachet'>('dec')
  const pvcFor = hmProduct === 'dec' ? p.pvcDec : hmProduct === 'torr' ? p.pvcTorr : p.pvcSachet
  function cellMarge(coque: number, rend: number) {
    const cd = coque / rend
    const cdr = hmProduct === 'dec' ? cd : hmProduct === 'torr' ? cd / (1 - p.pertTorr) : cd + p.embSachet * 20
    return { marge: pvcFor - cdr, pct: (pvcFor - cdr) / pvcFor }
  }

  const plData = PL_YEARS.map((y, i) => ({ year: y, CA: PL_CA[i], EBE: PL_EBE[i], RN: PL_RN[i], CFcum: PL_CFC[i] }))

  const slider = (label: string, val: number, min: number, max: number, step: number, set: (n: number) => void, suffix = '') => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: '#555' }}>{label}</span>
        <strong style={{ color: 'var(--green)' }}>{fmt(val, suffix === '%' ? 1 : 2)}{suffix}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => set(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#0f6e56' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '4px 2px 40px' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, marginBottom: 4 }}>Pilotage & marges</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Simulateur d&apos;unit-economics noisettes — fais varier les 3 leviers, lis l&apos;impact en direct.
        Le P&amp;L 13 ans reste ta source maître (Excel).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        {/* ── LEVIERS ── */}
        <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Leviers</h3>
          {slider('Prix d\'achat noisettes en coque', p.prixCoque, 2.5, 5, 0.05, v => setP({ ...p, prixCoque: v }), ' €/kg')}
          {slider('Rendement cassage', p.rendement * 100, 25, 45, 0.5, v => setP({ ...p, rendement: v / 100 }), '%')}
          {realYield && (
            <div style={{ fontSize: 12, color: '#0f6e56', marginTop: -8, marginBottom: 12, background: '#eef6f2', padding: '6px 10px', borderRadius: 8 }}>
              📊 Rendement réel observé : <strong>{fmt(realYield.avg * 100, 1)}%</strong> (sur {realYield.n} cassage{realYield.n > 1 ? 's' : ''}, {fmt(realYield.min * 100, 0)}–{fmt(realYield.max * 100, 0)}%)
              <button onClick={() => setP({ ...p, rendement: realYield.avg })}
                style={{ marginLeft: 6, fontSize: 11, color: 'var(--green)', textDecoration: 'underline' }}>appliquer</button>
            </div>
          )}
          {slider('Prix de vente décortiquées', p.pvcDec, 10, 22, 0.1, v => setP({ ...p, pvcDec: v }), ' €/kg')}
          {slider('Prix de vente torréfiées', p.pvcTorr, 12, 26, 0.1, v => setP({ ...p, pvcTorr: v }), ' €/kg')}
          <button onClick={() => setP(DEFAULTS)} style={{ fontSize: 12, color: '#999', textDecoration: 'underline', marginTop: 4 }}>réinitialiser</button>
        </div>

        {/* ── KPI par produit ── */}
        <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Marge au kg</h3>
          {products.map(pr => (
            <div key={pr.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid #eee' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{pr.nom}</div>
                <div style={{ fontSize: 11, color: '#999' }}>CDR {fmt(pr.cdr)} € · PVC {fmt(pr.pvc)} €</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: margeColor(pr.pct) }}>{pr.marge >= 0 ? '+' : ''}{fmt(pr.marge)} €</div>
                <div style={{ fontSize: 12, color: margeColor(pr.pct) }}>{fmt(pr.pct * 100, 0)} %</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>
            CDR = prix coque ÷ rendement. Torréfié : +{fmt(p.pertTorr * 100, 0)}% perte poids. Sachet : +{fmt(p.embSachet, 2)} €/sachet d&apos;emballage.
          </div>
        </div>
      </div>

      {/* ── HEATMAP 27 combos ── */}
      <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Matrice de marge €/kg</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['dec', 'Décortiquées'], ['torr', 'Torréfiées'], ['sachet', 'Sachet 50 g']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setHmProduct(k)}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: hmProduct === k ? 'var(--green)' : '#fff', color: hmProduct === k ? '#fff' : '#555' }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ fontSize: 11, color: '#888', textAlign: 'left', padding: 6 }}>Rendement ↓ / Prix coque →</th>
                {COQUE_RANGE.map(c => <th key={c} style={{ fontSize: 12, padding: 6, color: '#555' }}>{fmt(c, 2)} €</th>)}
              </tr>
            </thead>
            <tbody>
              {REND_RANGE.map(r => (
                <tr key={r}>
                  <td style={{ fontSize: 12, padding: 6, color: '#555', fontWeight: 500 }}>{fmt(r * 100, 1)} %</td>
                  {COQUE_RANGE.map(c => {
                    const { marge, pct } = cellMarge(c, r)
                    return (
                      <td key={c} style={{ padding: 6 }}>
                        <div style={{ background: margeColor(pct), color: '#fff', borderRadius: 6, padding: '8px 4px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
                          {marge >= 0 ? '+' : ''}{fmt(marge, 1)}
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{fmt(pct * 100, 0)}%</div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>PVC retenu : {fmt(pvcFor)} €/kg (curseur). Vert = marge confortable · rouge = perte.</div>
      </div>

      {/* ── P&L 13 ans ── */}
      <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginTop: 18 }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', marginBottom: 4 }}>Prévisionnel 13 ans</h3>
        <p style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>Source : PREV_Hanoa (Excel maître). CA &amp; EBE en barres, résultat net et trésorerie cumulée en courbes.</p>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={plData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="year" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: any) => fmtEur0(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#bbb" />
              <Bar dataKey="CA" name="CA" fill="#cfe3d8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="EBE" name="EBE" fill="#7fb069" radius={[3, 3, 0, 0]} />
              <Line dataKey="RN" name="Résultat net" stroke="#c0392b" strokeWidth={2} dot={false} />
              <Line dataKey="CFcum" name="Tréso cumulée" stroke="#0f6e56" strokeWidth={2} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11, color: '#e67e22', marginTop: 8 }}>
          ⚠️ Décrochage 2036-38 : les recettes transfo chutent (~1,36 M€ → 735 k€). À vérifier dans le modèle (fin de contrat / hypothèse de volume ?).
        </div>
      </div>
    </div>
  )
}
