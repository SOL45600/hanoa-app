'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import { FERTI_PLAN } from '@/lib/fertiPlan'

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const PARCELS = ['A', 'B1', 'B2', 'C', 'D1', 'D2', 'E', 'Verger entier']
const OPERATORS = ['Nathalie', 'Benjamin', 'Peter']
const CROPS = ['Noisette', 'Amande', 'Noix de pécan', 'Yuzu']

// Parcelle -> culture / surface (ha) / nb d'arbres (pour les produits dosés/arbre)
const PARCEL_CULTURE: Record<string, string> = {
  A: 'Noisette', B1: 'Noisette', B2: 'Noisette', C: 'Noisette',
  D1: 'Yuzu', D2: 'Amande', E: 'Noix de pécan',
}
const PARCEL_SURFACE: Record<string, number> = { A: 2.5, B1: 5.5, B2: 6, C: 8.5, D1: 0.7, D2: 2, E: 1 }
const PARCEL_TREES: Record<string, number> = { D1: 400, D2: 1400, E: 260 }
// Culture -> parcelle unique (mono-parcelle). La noisette a plusieurs parcelles -> pas d'auto.
const CULTURE_PARCEL: Record<string, string> = { Amande: 'D2', 'Noix de pécan': 'E', Yuzu: 'D1' }

const frNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')).replace('.', ',')

// Calcule la quantité totale à partir du dosage (/ha ou /arbre) et de la parcelle.
// Renvoie '' si non calculable (plage de valeurs, dose /L, parcelle sans surface/arbres…).
function computeQty(dosage: string, parcel: string): string {
  if (!dosage) return ''
  if (/\d\s*[–-]\s*\d/.test(dosage)) return '' // plage "4–5" -> saisie manuelle
  const m = dosage.toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)?\s*\/\s*(ha|arbre)/)
  if (!m) return ''
  const val = parseFloat(m[1]); let unit = m[2] || ''; const basis = m[3]
  let total: number
  if (basis === 'ha') { const s = PARCEL_SURFACE[parcel]; if (s == null) return ''; total = val * s }
  else { const t = PARCEL_TREES[parcel]; if (t == null) return ''; total = val * t }
  if (unit === 'g' && total >= 1000) { total = total / 1000; unit = 'kg' }
  return `${frNum(total)} ${unit}`.trim()
}
const TYPES = [
  { key: 'fertilisation', label: 'Fertilisation' },
  { key: 'phyto', label: 'Traitement phyto' },
]
const typeLabel = (k: string) => TYPES.find(t => t.key === k)?.label || k

interface Product { id: string; name: string; type: string; dosage: string; amm?: string | null; active?: boolean; crops?: string[] | null; base?: string | null }
const DOSE_BASES = ['à l\'ha', 'par arbre', 'par cuve 1500 L', 'par cuve 1000 L', 'par cuve 500 L', 'manuel']
interface Intervention {
  id: string; date: string; parcel: string; type: string; product_name: string
  dosage: string; dar: number; surface?: string | null; operator?: string | null; notes?: string | null
  target?: string | null; crop?: string | null; quantity_total?: string | null; amm?: string | null
}

const card: React.CSSProperties = { background: 'white', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const label: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid var(--border-mid)', borderRadius: 8, fontSize: 13, background: 'white' }
const btnGreen: React.CSSProperties = { padding: '9px 16px', background: 'var(--green)', color: 'white', borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif' }

export default function FertPhytoView({ supabase, userId, profile, sectionId }: {
  supabase: SupabaseClient; userId: string; profile: Profile; sectionId: string
}) {
  const isAdmin = profile.role === 'admin'
  const today = new Date().toISOString().slice(0, 10)
  const firstName = (profile.full_name || '').split(' ')[0]
  const defaultOperator = OPERATORS.includes(firstName) ? firstName : 'Peter'
  const [products, setProducts] = useState<Product[]>([])
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [showProducts, setShowProducts] = useState(false)
  const [showCalendar, setShowCalendar] = useState(true)
  const [form, setForm] = useState({
    date: today, parcel: 'A', type: 'fertilisation', product_id: '',
    dosage: '', dar: '0', surface: `${frNum(PARCEL_SURFACE['A'])} ha`, operator: defaultOperator, notes: '',
    crop: PARCEL_CULTURE['A'], target: '', quantity_total: '', hours: '',
  })

  // Parcelle -> auto culture + surface (+ reset produit si la culture change) + recalcul quantité.
  const onParcelChange = (parcel: string) => {
    setForm(f => {
      const crop = PARCEL_CULTURE[parcel] || f.crop
      const cropChanged = crop !== f.crop
      const surface = PARCEL_SURFACE[parcel] != null ? `${frNum(PARCEL_SURFACE[parcel])} ha` : f.surface
      const dosage = cropChanged ? '' : f.dosage
      const product_id = cropChanged ? '' : f.product_id
      return { ...f, parcel, crop, surface, dosage, product_id, quantity_total: computeQty(dosage, parcel) }
    })
  }

  const load = async () => {
    setLoading(true)
    const [{ data: prods, error: pe }, { data: ints }] = await Promise.all([
      supabase.from('fert_phyto_products').select('*').order('name'),
      supabase.from('bio_interventions').select('*').order('date', { ascending: false }),
    ])
    if (pe) setErr('Tables manquantes ? Exécute le SQL fourni. (' + pe.message + ')')
    else setErr('')
    setProducts(prods || [])
    setInterventions(ints || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const productsOfType = products.filter(p =>
    p.type === form.type && p.active !== false &&
    (!p.crops || p.crops.length === 0 || p.crops.includes(form.crop))
  )
  const selectedProduct = products.find(p => p.id === form.product_id)

  const onSelectProduct = (id: string) => {
    const p = products.find(x => x.id === id)
    setForm(f => {
      const dosage = p?.dosage || f.dosage
      return { ...f, product_id: id, dosage, quantity_total: computeQty(dosage, f.parcel) }
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) { setErr('Choisis un produit dans la liste.'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.from('bio_interventions').insert({
      date: form.date, parcel: form.parcel, type: form.type,
      product_name: selectedProduct.name, dosage: form.dosage || selectedProduct.dosage,
      dar: parseInt(form.dar) || 0, surface: form.surface || null,
      operator: form.operator || null, notes: form.notes || null,
      crop: form.crop || null, target: form.target || null,
      quantity_total: form.quantity_total || null, amm: selectedProduct.amm || null,
      section_id: sectionId, created_by: userId,
    }).select('*').single()
    if (error) { setErr(error.message); setSaving(false); return }
    setInterventions(xs => [data, ...xs])
    // Connexion au module Temps : crée un pointage si "temps passé" est renseigné
    const h = parseFloat((form.hours || '').replace(',', '.'))
    if (h > 0) {
      try {
        await supabase.from('time_entries').insert({
          date: form.date, operator: form.operator,
          parcel: form.parcel === '—' ? null : form.parcel,
          activity: 'Ferti / phyto', hours: h,
          note: selectedProduct.name, created_by: userId,
        })
      } catch { /* best-effort */ }
    }
    setForm(f => ({ ...f, surface: '', notes: '', target: '', quantity_total: '', hours: '' }))
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Supprimer cette intervention du registre BIO ?')) return
    await supabase.from('bio_interventions').delete().eq('id', id)
    setInterventions(xs => xs.filter(x => x.id !== id))
  }

  const exportCsv = () => {
    const headers = ['Date', 'Parcelle', 'Culture', 'Type', 'Produit', 'N° AMM', 'Cible', 'Dosage', 'Qté totale', 'DAR (j)', 'Surface', 'Opérateur', 'Notes']
    const rows = interventions.map(i => [i.date, i.parcel, i.crop || '', typeLabel(i.type), i.product_name, i.amm || '', i.target || '', i.dosage, i.quantity_total || '', String(i.dar), i.surface || '', i.operator || '', i.notes || ''])
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `registre-fert-phyto-${today}.csv`
    a.click()
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {err && <div style={{ ...card, background: '#faece7', color: '#d85a30', fontSize: 13 }}>{err}</div>}

      {/* Calendrier prévisionnel mois par mois (vue d'ensemble, lecture seule) */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setShowCalendar(s => !s)}>
          <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Calendrier prévisionnel des passages</h3>
          <i className={`ti ${showCalendar ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: 'var(--muted)' }} />
        </div>
        {showCalendar && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
            {MONTH_NAMES.map((mn, mi) => {
              const items = FERTI_PLAN.filter(i => i.month === mi && i.row === 'vergers_ferti_phyto')
              if (!items.length) return null
              return (
                <div key={mi} style={{ border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 6, fontSize: 13 }}>{mn}</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text)' }}>
                    {items.map((i, k) => <li key={k} style={{ marginBottom: 4 }}>{i.title}</li>)}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Formulaire de saisie ── */}
      <form onSubmit={submit} style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px' }}>Nouvelle intervention</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <label style={label}>Date *</label>
            <input style={input} type="date" required value={form.date} onChange={e => setField('date', e.target.value)} />
          </div>
          <div>
            <label style={label}>Parcelle *</label>
            <select style={input} value={form.parcel} onChange={e => onParcelChange(e.target.value)}>
              {PARCELS.map(p => <option key={p} value={p}>{p}{PARCEL_CULTURE[p] ? ` — ${PARCEL_CULTURE[p]}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Culture</label>
            <select style={input} value={form.crop} onChange={e => setForm(f => {
              const crop = e.target.value
              const parcel = CULTURE_PARCEL[crop] || f.parcel
              const surface = PARCEL_SURFACE[parcel] != null ? `${frNum(PARCEL_SURFACE[parcel])} ha` : f.surface
              return { ...f, crop, parcel, surface, product_id: '', dosage: '', quantity_total: '' }
            })}>
              {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Type *</label>
            <select style={input} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, product_id: '', dosage: '' }))}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Produit *</label>
            <select style={input} value={form.product_id} onChange={e => onSelectProduct(e.target.value)}>
              <option value="">— Choisir —</option>
              {productsOfType.map(p => <option key={p.id} value={p.id}>{p.name}{p.base ? ` · ${p.base}` : ''}</option>)}
            </select>
          </div>
          {form.type === 'phyto' && (
            <div>
              <label style={label}>Cible</label>
              <input style={input} value={form.target} onChange={e => setField('target', e.target.value)} placeholder="ravageur / maladie / adventice" />
            </div>
          )}
          <div>
            <label style={label}>Dosage</label>
            <input style={input} value={form.dosage}
              onChange={e => setForm(f => ({ ...f, dosage: e.target.value, quantity_total: computeQty(e.target.value, f.parcel) }))}
              placeholder="ex : 2 L/ha" />
          </div>
          <div>
            <label style={label}>DAR (jours)</label>
            <input style={input} type="number" min="0" value={form.dar} onChange={e => setField('dar', e.target.value)} />
          </div>
          <div>
            <label style={label}>Surface (optionnel)</label>
            <input style={input} value={form.surface} onChange={e => setField('surface', e.target.value)} placeholder="ex : 1,2 ha" />
          </div>
          <div>
            <label style={label}>Quantité totale</label>
            <input style={input} value={form.quantity_total} onChange={e => setField('quantity_total', e.target.value)} placeholder="ex : 12 kg / 30 L" />
          </div>
          <div>
            <label style={label}>Temps passé (h) → Temps</label>
            <input style={input} value={form.hours} onChange={e => setField('hours', e.target.value)} placeholder="ex : 2,5" />
          </div>
          <div>
            <label style={label}>Opérateur</label>
            <select style={input} value={form.operator} onChange={e => setField('operator', e.target.value)}>
              {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={label}>Notes (optionnel)</label>
          <input style={input} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="conditions météo, observations…" />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <button type="submit" disabled={saving} style={btnGreen}>{saving ? 'Enregistrement…' : 'Ajouter au registre'}</button>
          {productsOfType.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun produit pour ce type — ajoute-en via « Gérer les produits ».</span>}
        </div>
        {err && <div style={{ marginTop: 12, background: '#faece7', color: '#d85a30', fontSize: 13, padding: '10px 12px', borderRadius: 8 }}>⚠️ {err}</div>}
      </form>

      {/* ── Registre (tableau) ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Registre de contrôle BIO — {interventions.length} intervention(s)</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCsv} style={{ ...input, width: 'auto', cursor: 'pointer', color: 'var(--green)' }}><i className="ti ti-download" /> Export CSV</button>
            <button onClick={() => setShowProducts(s => !s)} style={{ ...input, width: 'auto', cursor: 'pointer' }}><i className="ti ti-list" /> Gérer les produits</button>
          </div>
        </div>

        {showProducts && <ProductsManager products={products} supabase={supabase} isAdmin={isAdmin} onChange={load} />}

        {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                  {['Date', 'Parcelle', 'Culture', 'Type', 'Produit', 'N° AMM', 'Cible', 'Dosage', 'Qté totale', 'DAR', 'Opérateur', ''].map((h, k) => (
                    <th key={k} style={{ padding: '6px 8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {interventions.map(i => (
                  <tr key={i.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{new Date(i.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '6px 8px' }}>{i.parcel}</td>
                    <td style={{ padding: '6px 8px' }}>{i.crop}</td>
                    <td style={{ padding: '6px 8px' }}>{typeLabel(i.type)}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{i.product_name}</td>
                    <td style={{ padding: '6px 8px' }}>{i.amm}</td>
                    <td style={{ padding: '6px 8px' }}>{i.target}</td>
                    <td style={{ padding: '6px 8px' }}>{i.dosage}</td>
                    <td style={{ padding: '6px 8px' }}>{i.quantity_total}</td>
                    <td style={{ padding: '6px 8px' }}>{i.dar} j</td>
                    <td style={{ padding: '6px 8px' }}>{i.operator}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button onClick={() => del(i.id)} title="Supprimer" style={{ color: '#d85a30' }}><i className="ti ti-trash" /></button>
                    </td>
                  </tr>
                ))}
                {interventions.length === 0 && <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>Aucune intervention enregistrée</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Gestion des produits (éditable) ── */
function ProductsManager({ products, supabase, isAdmin, onChange }: {
  products: Product[]; supabase: SupabaseClient; isAdmin: boolean; onChange: () => void
}) {
  const [np, setNp] = useState<{ name: string; type: string; dosage: string; amm: string; base: string; crops: string[] }>(
    { name: '', type: 'fertilisation', dosage: '', amm: '', base: 'à l\'ha', crops: [...CROPS] }
  )
  const add = async () => {
    if (!np.name.trim()) return
    await supabase.from('fert_phyto_products').insert({
      name: np.name.trim(), type: np.type, dosage: np.dosage.trim(), amm: np.amm.trim() || null, active: true,
      base: np.base, crops: np.crops.length ? np.crops : null,
    })
    setNp({ name: '', type: 'fertilisation', dosage: '', amm: '', base: 'à l\'ha', crops: [...CROPS] })
    onChange()
  }
  const remove = async (id: string) => {
    if (!confirm('Supprimer ce produit de la liste ?')) return
    await supabase.from('fert_phyto_products').delete().eq('id', id)
    onChange()
  }

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Produits fert-phyto</div>
      {!isAdmin && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Seul un admin peut modifier la liste.</div>}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <input style={{ ...input, width: 180 }} placeholder="Nom du produit" value={np.name} onChange={e => setNp(p => ({ ...p, name: e.target.value }))} />
          <select style={{ ...input, width: 150 }} value={np.type} onChange={e => setNp(p => ({ ...p, type: e.target.value }))}>
            {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input style={{ ...input, width: 110 }} placeholder="Dosage" value={np.dosage} onChange={e => setNp(p => ({ ...p, dosage: e.target.value }))} />
          <input style={{ ...input, width: 120 }} placeholder="N° AMM (phyto)" value={np.amm} onChange={e => setNp(p => ({ ...p, amm: e.target.value }))} />
          <select style={{ ...input, width: 150 }} value={np.base} onChange={e => setNp(p => ({ ...p, base: e.target.value }))} title="Base de dosage">
            {DOSE_BASES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Cultures :</span>
            {CROPS.map(c => {
              const on = np.crops.includes(c)
              return (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on}
                    onChange={() => setNp(p => ({ ...p, crops: on ? p.crops.filter(x => x !== c) : [...p.crops, c] }))} />
                  {c}
                </label>
              )
            })}
          </div>
          <button onClick={add} style={{ ...btnGreen, padding: '8px 14px', fontSize: 13 }}>Ajouter</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {products.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'white', borderRadius: 6, padding: '5px 8px' }}>
            <span style={{ flex: 1 }}><strong>{p.name}</strong> · {typeLabel(p.type)} · {p.dosage}{p.base ? ` (${p.base})` : ''}{p.amm ? ` · AMM ${p.amm}` : ''}{p.crops?.length ? ` · ${p.crops.join(', ')}` : ' · toutes cultures'}</span>
            {isAdmin && <button onClick={() => remove(p.id)} style={{ color: '#d85a30' }}><i className="ti ti-trash" /></button>}
          </div>
        ))}
        {products.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun produit. {isAdmin ? 'Ajoute-en ci-dessus.' : ''}</span>}
      </div>
    </div>
  )
}
