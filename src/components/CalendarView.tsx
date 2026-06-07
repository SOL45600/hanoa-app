'use client'
import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import { FERTI_PLAN } from '@/lib/fertiPlan'
import styles from './CalendarView.module.css'

// Weather icons from Weenat data
const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️', foggy: '🌫️',
}

interface WeatherData {
  date: string
  temp_max?: number
  temp_min?: number
  rainfall?: number
}

/* ─── CONFIG ─────────────────────────────────────────────────── */
const PLANNING_ROWS = [
  {
    group: 'Les vergers', icon: 'ti-tree', color: '#0f6e56',
    rows: [
      { key: 'vergers_irrigation',   label: 'Irrigation' },
      { key: 'vergers_ferti_phyto',  label: 'Ferti-phyto' },
      { key: 'vergers_entretien',    label: 'Entretien' },
      { key: 'vergers_divers',       label: 'Divers' },
    ]
  },
  {
    group: 'Transformation', icon: 'ti-settings', color: '#185fa5',
    rows: [
      { key: 'transfo_stabilisation',    label: 'Stabilisation' },
      { key: 'transfo_laboratoire',      label: 'Laboratoire' },
      { key: 'transfo_conditionnement',  label: 'Conditionnement' },
    ]
  },
  {
    group: 'Divers', icon: 'ti-layout-grid', color: '#888',
    rows: [
      { key: 'divers', label: 'Divers' },
    ]
  },
  {
    group: 'Commandes', icon: 'ti-package', color: '#ba7517',
    rows: [
      { key: 'commandes', label: 'À préparer' },
    ]
  },
]

// Row that is auto-populated from orders (read-only), not from tasks.
const COMMANDES_ROW = 'commandes'

const ROW_KEYS = PLANNING_ROWS.flatMap(g => g.rows.map(r => r.key))

// FERTI_PLAN est désormais partagé via src/lib/fertiPlan.ts (planning + cron)

// Mappe une ligne du planning vers une activité du suivi du temps (TempsView)
const ROWKEY_ACTIVITY: Record<string, string> = {
  vergers_irrigation: 'Irrigation',
  vergers_ferti_phyto: 'Ferti / phyto',
  vergers_entretien: 'Entretien matériel',
  vergers_divers: 'Divers',
  transfo_stabilisation: 'Transformation',
  transfo_laboratoire: 'Transformation',
  transfo_conditionnement: 'Conditionnement / tri',
  divers: 'Divers',
  commandes: 'Commandes',
}

/* ─── UTILS ─────────────────────────────────────────────────── */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addWeeks(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

function weekKey(date: Date): string {
  // Local date parts (pas toISOString) pour éviter le décalage UTC du lundi
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

function fmtWeekHeader(date: Date): { num: string; range: string } {
  const mon = new Date(date)
  const sun = new Date(date)
  sun.setDate(sun.getDate() + 6)
  const weekNum = Math.ceil(((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return { num: `S${weekNum}`, range: `${fmt(mon)} – ${fmt(sun)}` }
}

function isThisWeek(date: Date): boolean {
  return weekKey(getMondayOfWeek(new Date())) === weekKey(date)
}

/* ─── TYPES ─────────────────────────────────────────────────── */
interface Task {
  id: string
  title: string
  description?: string
  row_key: string
  week_start: string
  assigned_to?: string
  assignee_name?: string
  created_by: string
  status: string
  color?: string
}

interface OrderLite {
  id: string
  order_number: string
  client: string
  ship_date: string
  status: string
}

// Status colors mirror CommandesView
const ORDER_STATUS_COLOR: Record<string, string> = {
  a_preparer: '#ba7517', prepare: '#185fa5', envoye: '#0f6e56', livre: '#888',
}

interface Props {
  supabase: SupabaseClient
  userId: string
  profile: Profile
  sections?: { id: string; label: string }[]
  myOnly?: boolean
}

/* ─── TASK CHIP ──────────────────────────────────────────────── */
function TaskChip({ task, profiles, onDelete, onView, currentUserId }: {
  task: Task; profiles: Profile[]; onDelete: () => void; onView: () => void; currentUserId: string
}) {
  const assignee = profiles.find(p => p.id === task.assigned_to)
  const extName = !assignee ? (task.assignee_name || '') : ''
  const extInitials = extName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const badgeColor = assignee?.color || '#8a8a86'
  const isDone = task.status === 'fait'
  return (
    <div className={`${styles.chip} ${isDone ? styles.chipDone : ''}`}
      onClick={e => { e.stopPropagation(); onView() }}
      style={{ borderLeftColor: task.color || assignee?.color || '#0f6e56', cursor: 'pointer' }}>
      <span className={styles.chipTitle}>{task.title}</span>
      {(assignee || extName) && (
        <span className={styles.chipAssignee} title={assignee?.full_name || extName}
          style={{ background: badgeColor + '22', color: badgeColor }}>
          {assignee?.initials || extInitials}
        </span>
      )}
      {(task.created_by === currentUserId || !task.assigned_to) && (
        <button className={styles.chipDelete} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
      )}
    </div>
  )
}

/* ─── TASK MODAL ─────────────────────────────────────────────── */
function TaskModal({ weekDate, rowKey, rowLabel, profiles, userId, onSave, onClose, error }: {
  weekDate: Date; rowKey: string; rowLabel: string; profiles: Profile[]
  userId: string; onSave: (task: Omit<Task, 'id' | 'created_by'>) => void; onClose: () => void
  error?: string
}) {
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', assignee_name: '', status: 'a_faire', color: ''
  })
  const { num, range } = fmtWeekHeader(weekDate)
  const isExternal = form.assigned_to === '__external__'

  const submit = () => {
    if (!form.title.trim()) return
    const payload: Omit<Task, 'id' | 'created_by'> = {
      title: form.title, description: form.description, status: form.status, color: form.color,
      row_key: rowKey, week_start: weekKey(weekDate),
      assigned_to: isExternal ? undefined : (form.assigned_to || undefined),
    }
    // Only set assignee_name for external people (avoids referencing the column for member tasks)
    if (isExternal && form.assignee_name.trim()) payload.assignee_name = form.assignee_name.trim()
    onSave(payload)
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.modalWeek}>{num} · {range}</span>
            <h3>{rowLabel}</h3>
          </div>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Tâche *</label>
            <input autoFocus required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Décrivez la tâche…"
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
            />
          </div>
          <div className={styles.field}>
            <label>Détails</label>
            <textarea value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Notes, quantités, instructions…" />
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label>Assigner à</label>
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">— Non assigné —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                <option value="__external__">+ Autre (nom libre)…</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Statut</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="fait">Fait ✓</option>
              </select>
            </div>
          </div>
          {isExternal && (
            <div className={styles.field}>
              <label>Nom de la personne</label>
              <input autoFocus value={form.assignee_name}
                onChange={e => setForm(f => ({ ...f, assignee_name: e.target.value }))}
                placeholder="ex : Yannick" />
            </div>
          )}
        </div>
        {error && <div className={styles.modalError}><i className="ti ti-alert-circle" /> {error}</div>}
        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.cancelBtn}>Annuler</button>
          <button
            disabled={!form.title.trim() || (isExternal && !form.assignee_name.trim())}
            onClick={submit}
            className={styles.saveBtn}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── TASK DETAIL MODAL (visualisation) ──────────────────────── */
function TaskDetailModal({ task, profiles, onClose, onStatusChange, onDelete, onLogTime }: {
  task: Task; profiles: Profile[]; onClose: () => void
  onStatusChange: (id: string, status: string) => void; onDelete: (id: string) => void
  onLogTime: (task: Task, hours: string, parcel: string) => Promise<boolean>
}) {
  const assignee = profiles.find(p => p.id === task.assigned_to)
  const assigneeName = assignee?.full_name || task.assignee_name
  const rowLabel = PLANNING_ROWS.flatMap(g => g.rows).find(r => r.key === task.row_key)?.label || task.row_key
  const wk = fmtWeekHeader(new Date(task.week_start))
  const [logH, setLogH] = useState('')
  const [logP, setLogP] = useState('')
  const [logged, setLogged] = useState(false)
  const [logErr, setLogErr] = useState('')
  const miniInput: React.CSSProperties = { padding: '7px 9px', border: '0.5px solid var(--border-mid)', borderRadius: 7, fontSize: 13, background: 'white' }
  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.modalWeek}>{wk.num} · {wk.range}</span>
            <h3>{rowLabel}</h3>
          </div>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Tâche</label>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{task.title}</div>
          </div>
          {task.description && (
            <div className={styles.field}>
              <label>Détails</label>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text)' }}>{task.description}</div>
            </div>
          )}
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label>Assigné à</label>
              <div style={{ fontSize: 14 }}>{assigneeName || '— Non assigné —'}</div>
            </div>
            <div className={styles.field}>
              <label>Statut</label>
              <select value={task.status} onChange={e => onStatusChange(task.id, e.target.value)}>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="fait">Fait ✓</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label>Pointer du temps (→ Temps)</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...miniInput, width: 90 }} value={logH} onChange={e => setLogH(e.target.value)} placeholder="heures" />
              <input style={{ ...miniInput, width: 110 }} value={logP} onChange={e => setLogP(e.target.value)} placeholder="parcelle" />
              <button type="button" className={styles.saveBtn} style={{ padding: '7px 12px', fontSize: 13 }}
                onClick={async () => {
                  setLogErr('')
                  const ok = await onLogTime(task, logH, logP)
                  if (ok) { setLogged(true); setLogH(''); setLogP('') }
                  else setLogErr('Heures invalides, ou table Temps non créée.')
                }}>Pointer</button>
              {logged && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ enregistré</span>}
            </div>
            {logErr && <span style={{ fontSize: 12, color: '#d85a30' }}>{logErr}</span>}
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button onClick={() => { if (confirm('Supprimer cette tâche ?')) { onDelete(task.id); onClose() } }}
            className={styles.cancelBtn} style={{ color: '#d85a30' }}>Supprimer</button>
          <button onClick={onClose} className={styles.saveBtn}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN ───────────────────────────────────────────────────── */
export default function CalendarView({ supabase, userId, profile, myOnly = false }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [orders, setOrders] = useState<OrderLite[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [weather, setWeather] = useState<Record<string, WeatherData>>({})
  const [startWeek, setStartWeek] = useState(() => getMondayOfWeek(new Date()))
  const [numWeeks] = useState(12)
  const [addingCell, setAddingCell] = useState<{ week: Date; rowKey: string; rowLabel: string } | null>(null)
  const [viewingTask, setViewingTask] = useState<Task | null>(null)
  const [filterUser, setFilterUser] = useState<string>(myOnly ? userId : '')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase.from('tasks').select('*').then(({ data }) => setTasks(data || []))
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => {
      if (data && data.length > 0) setProfiles(data)
    })
    // Orders to prepare — shown on the "Commandes" row, week before shipping.
    supabase.from('orders')
      .select('id, order_number, client, ship_date, status')
      .not('ship_date', 'is', null)
      .neq('status', 'livre')
      .then(({ data }) => setOrders((data || []) as OrderLite[]))
    // Fetch weather from Weenat station
    fetch('/api/weenat?type=device&id=76938&days=14&step=day')
      .then(r => r.json())
      .then(d => {
        const wMap: Record<string, WeatherData> = {}
        ;(d.data || []).forEach((item: any) => {
          const dateKey = item.datetime?.slice(0, 10)
          if (dateKey) wMap[dateKey] = { date: dateKey, temp_max: item.T, rainfall: item.RR }
        })
        setWeather(wMap)
      }).catch(() => {})
  }, [])

  const weeks = Array.from({ length: numWeeks }, (_, i) => addWeeks(startWeek, i))

  const getTasksForCell = (rowKey: string, week: Date) => {
    const wk = weekKey(week)
    return tasks.filter(t => t.row_key === rowKey && t.week_start === wk &&
      (!filterUser || t.assigned_to === filterUser))
  }

  // Commandes are auto-assigned to Peter and shown the week BEFORE shipping.
  const peter = profiles.find(p => p.email?.toLowerCase() === 'peter@s-o-l.fr')
  const prepWeekKey = (shipDate: string) => weekKey(addWeeks(getMondayOfWeek(new Date(shipDate)), -1))

  const getOrdersForCell = (week: Date) => {
    const wk = weekKey(week)
    // When filtering by a user other than Peter, commandes (Peter's) are hidden.
    if (filterUser && peter && filterUser !== peter.id) return []
    return orders.filter(o => o.ship_date && prepWeekKey(o.ship_date) === wk)
  }

  // Weather for a week: aggregate over its 7 days (Weenat = past/present only).
  const getWeekWeather = (monday: Date): WeatherData | null => {
    let tMax: number | undefined, rain = 0, hasRain = false, found = false
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i)
      const wd = weather[weekKey(d)]
      if (!wd) continue
      found = true
      if (wd.temp_max != null) tMax = tMax == null ? wd.temp_max : Math.max(tMax, wd.temp_max)
      if (wd.rainfall != null) { rain += wd.rainfall; hasRain = true }
    }
    if (!found) return null
    return { date: weekKey(monday), temp_max: tMax, rainfall: hasRain ? rain : undefined }
  }

  const addTask = async (data: Omit<Task, 'id' | 'created_by'>) => {
    setSaveError('')
    const { data: task, error } = await supabase.from('tasks')
      .insert({ ...data, created_by: userId, due_date: data.week_start })
      .select('*').single()
    if (error || !task) {
      setSaveError(error?.message || 'Erreur — vérifiez que la migration SQL a été exécutée.')
      return
    }
    setTasks(ts => [...ts, task])
    setAddingCell(null)

    // Notify assigned user
    if (data.assigned_to && data.assigned_to !== userId) {
      const assignee = profiles.find(p => p.id === data.assigned_to)
      if (assignee?.email) {
        const wk = fmtWeekHeader(new Date(data.week_start))
        const rowLabel = PLANNING_ROWS.flatMap(g => g.rows).find(r => r.key === data.row_key)?.label || ''
        fetch('/api/notify/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assigneeId: data.assigned_to,
            assignerName: profile.full_name,
            taskTitle: data.title,
            weekLabel: `${wk.num} (${wk.range})`,
            rowLabel,
          }),
        }).catch(() => {})
      }
    }
  }

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(ts => ts.filter(t => t.id !== id))
  }

  const updateTaskStatus = async (id: string, status: string) => {
    const prev = tasks.find(x => x.id === id)
    await supabase.from('tasks').update({ status }).eq('id', id)
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))
    setViewingTask(v => (v && v.id === id ? { ...v, status } : v))
    // Auto-registre BIO : une tâche ferti-phyto marquée "Fait" crée une entrée dans le registre
    if (status === 'fait' && prev && prev.status !== 'fait' && prev.row_key.includes('ferti')) {
      const assignee = profiles.find(p => p.id === prev.assigned_to)
      const op = assignee?.full_name?.split(' ')[0] || prev.assignee_name || null
      const isPhyto = /(kaolin|bb rsr|bouillie|curatio|champ flo|calciblanc)/i.test(prev.title)
      try {
        await supabase.from('bio_interventions').insert({
          date: new Date().toISOString().slice(0, 10),
          activity: 'Ferti / phyto', type: isPhyto ? 'phyto' : 'fertilisation',
          product_name: prev.title, operator: op, note: 'Auto depuis le planning', created_by: userId,
        })
      } catch { /* best-effort */ }
    }
  }

  // Pointer du temps depuis une tâche -> crée une entrée dans time_entries
  const logTimeForTask = async (task: Task, hours: string, parcel: string): Promise<boolean> => {
    const h = parseFloat(String(hours).replace(',', '.'))
    if (!h || h <= 0) return false
    const assignee = profiles.find(p => p.id === task.assigned_to)
    const operator = (assignee?.full_name?.split(' ')[0]) || task.assignee_name || (profile.full_name || '').split(' ')[0]
    const { error } = await supabase.from('time_entries').insert({
      date: new Date().toISOString().slice(0, 10),
      operator, parcel: parcel || null,
      activity: ROWKEY_ACTIVITY[task.row_key] || 'Divers',
      hours: h, task_id: task.id, note: task.title, created_by: userId,
    })
    return !error
  }

  // #5 — Génère les passages ferti-phyto du calendrier mutualisé dans le planning (année en cours)
  const generateFertiPlan = async () => {
    const year = new Date().getFullYear()
    const toInsert: any[] = []
    for (const item of FERTI_PLAN) {
      const wk = weekKey(getMondayOfWeek(new Date(year, item.month, 10)))
      if (!tasks.some(t => t.row_key === item.row && t.title === item.title && (t.week_start || '').slice(0, 4) === String(year))) {
        toInsert.push({
          title: item.title, row_key: item.row, week_start: wk, status: 'a_faire',
          created_by: userId, due_date: wk, assignee_name: 'Toute l\'équipe',
        })
      }
    }
    if (!toInsert.length) { alert(`Plan ferti-phyto ${year} déjà présent (rien à ajouter).`); return }
    const { data, error } = await supabase.from('tasks').insert(toInsert).select('*')
    if (error) {
      alert('Erreur : ' + error.message + (error.message.includes('assignee_name')
        ? '\n\n→ Lance dans Supabase : alter table tasks add column if not exists assignee_name text;' : ''))
      return
    }
    setTasks(ts => [...ts, ...(data || [])])
    alert(`${data?.length || 0} passage(s) ferti-phyto ajouté(s) au planning ${year}.`)
  }

  // #5 — Reporte les tâches non faites en retard vers la semaine en cours
  const carryOverOverdue = async () => {
    const thisMonday = weekKey(getMondayOfWeek(new Date()))
    const overdue = tasks.filter(t => t.status !== 'fait' && t.week_start < thisMonday)
    if (!overdue.length) { alert('Aucune tâche en retard à reporter.'); return }
    if (!confirm(`${overdue.length} tâche(s) non faite(s) en retard seront déplacées à la semaine en cours. Continuer ?`)) return
    await Promise.all(overdue.map(t =>
      supabase.from('tasks').update({ week_start: thisMonday, due_date: thisMonday }).eq('id', t.id)))
    setTasks(ts => ts.map(t => (t.status !== 'fait' && t.week_start < thisMonday) ? { ...t, week_start: thisMonday } : t))
    alert(`${overdue.length} tâche(s) reportée(s) à la semaine en cours.`)
  }

  const allProfiles = profiles

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={() => setStartWeek(w => addWeeks(w, -4))} className={styles.navBtn}>
            <i className="ti ti-chevron-left" />
          </button>
          <button onClick={() => setStartWeek(getMondayOfWeek(new Date()))} className={styles.todayBtn}>
            Aujourd'hui
          </button>
          <button onClick={() => setStartWeek(w => addWeeks(w, 4))} className={styles.navBtn}>
            <i className="ti ti-chevron-right" />
          </button>
          <span className={styles.periodLabel}>
            {fmtWeekHeader(startWeek).range.split('–')[0].trim()} — {fmtWeekHeader(addWeeks(startWeek, numWeeks - 1)).range.split('–')[1].trim()}
          </span>
        </div>
        <div className={styles.headerRight}>
          {profile.role === 'admin' && (
            <>
              <button className={styles.todayBtn} onClick={generateFertiPlan} title="Générer les passages ferti-phyto du calendrier dans le planning">
                <i className="ti ti-calendar-plus" /> Plan ferti-phyto
              </button>
              <button className={styles.todayBtn} onClick={carryOverOverdue} title="Reporter les tâches non faites en retard à la semaine en cours">
                <i className="ti ti-arrow-forward-up" /> Reporter en retard
              </button>
            </>
          )}
          <select className={styles.filterSelect}
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}>
            <option value="">Tous</option>
            {allProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th className={styles.thGroup}></th>
              <th className={styles.thRow}></th>
              {weeks.map(w => {
                const { num, range } = fmtWeekHeader(w)
                return (
                  <th key={weekKey(w)} className={`${styles.thWeek} ${isThisWeek(w) ? styles.thToday : ''}`}>
                    <div className={styles.weekNum}>{num}</div>
                    <div className={styles.weekRange}>{range}</div>
                    {(() => {
                      const wd = getWeekWeather(w)
                      if (!wd) return null
                      return (
                        <div className={styles.weekWeather}>
                          {wd.temp_max != null && <span>🌡️{wd.temp_max.toFixed(0)}°</span>}
                          {wd.rainfall != null && wd.rainfall > 0 && <span>🌧️{wd.rainfall.toFixed(0)}mm</span>}
                        </div>
                      )
                    })()}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {PLANNING_ROWS.map((group, gi) => (
              group.rows.map((row, ri) => (
                <tr key={row.key} className={ri === 0 ? styles.trFirst : ''}>
                  {ri === 0 && (
                    <td rowSpan={group.rows.length} className={styles.tdGroup}>
                      <div className={styles.groupLabel} style={{ color: group.color }}>
                        <i className={`ti ${group.icon}`} />
                        {group.group}
                      </div>
                    </td>
                  )}
                  <td className={styles.tdRow}>{row.label}</td>
                  {row.key === COMMANDES_ROW
                    ? weeks.map(w => {
                        const cellOrders = getOrdersForCell(w)
                        return (
                          <td key={weekKey(w)}
                            className={`${styles.tdCell} ${isThisWeek(w) ? styles.tdToday : ''}`}>
                            {cellOrders.map(o => (
                              <div key={o.id} className={`${styles.chip}`}
                                style={{ borderLeftColor: ORDER_STATUS_COLOR[o.status] || '#ba7517' }}
                                title={`Commande #${o.order_number} — ${o.client} · envoi ${fmtWeekHeader(getMondayOfWeek(new Date(o.ship_date))).range}`}>
                                <span className={styles.chipTitle}>#{o.order_number} {o.client}</span>
                                {peter && (
                                  <span className={styles.chipAssignee}
                                    style={{ background: (peter.color || '#ba7517') + '22', color: peter.color || '#ba7517' }}>
                                    {peter.initials}
                                  </span>
                                )}
                              </div>
                            ))}
                          </td>
                        )
                      })
                    : weeks.map(w => {
                        const cellTasks = getTasksForCell(row.key, w)
                        return (
                          <td key={weekKey(w)}
                            className={`${styles.tdCell} ${isThisWeek(w) ? styles.tdToday : ''}`}
                            onClick={() => setAddingCell({ week: w, rowKey: row.key, rowLabel: row.label })}>
                            {cellTasks.map(t => (
                              <TaskChip key={t.id} task={t} profiles={allProfiles}
                                onDelete={() => deleteTask(t.id)} onView={() => setViewingTask(t)} currentUserId={userId} />
                            ))}
                            <div className={styles.cellAdd}>+</div>
                          </td>
                        )
                      })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {addingCell && (
        <TaskModal
          weekDate={addingCell.week}
          rowKey={addingCell.rowKey}
          rowLabel={addingCell.rowLabel}
          profiles={allProfiles}
          userId={userId}
          onSave={addTask}
          onClose={() => { setAddingCell(null); setSaveError('') }}
          error={saveError}
        />
      )}

      {viewingTask && (
        <TaskDetailModal
          task={viewingTask}
          profiles={allProfiles}
          onClose={() => setViewingTask(null)}
          onStatusChange={updateTaskStatus}
          onDelete={deleteTask}
          onLogTime={logTimeForTask}
        />
      )}
    </div>
  )
}
