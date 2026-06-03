'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import styles from './CalendarView.module.css'

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
]

const ROW_KEYS = PLANNING_ROWS.flatMap(g => g.rows.map(r => r.key))

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
  return date.toISOString().slice(0, 10)
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
  created_by: string
  status: string
  color?: string
}

interface Props {
  supabase: SupabaseClient
  userId: string
  profile: Profile
  sections?: { id: string; label: string }[]
  myOnly?: boolean
}

/* ─── TASK CHIP ──────────────────────────────────────────────── */
function TaskChip({ task, profiles, onDelete, currentUserId }: {
  task: Task; profiles: Profile[]; onDelete: () => void; currentUserId: string
}) {
  const assignee = profiles.find(p => p.id === task.assigned_to)
  const isDone = task.status === 'fait'
  return (
    <div className={`${styles.chip} ${isDone ? styles.chipDone : ''}`}
      style={{ borderLeftColor: task.color || assignee?.color || '#0f6e56' }}>
      <span className={styles.chipTitle}>{task.title}</span>
      {assignee && (
        <span className={styles.chipAssignee} style={{ background: (assignee.color || '#0f6e56') + '22', color: assignee.color || '#0f6e56' }}>
          {assignee.initials}
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
    title: '', description: '', assigned_to: '', status: 'a_faire', color: ''
  })
  const { num, range } = fmtWeekHeader(weekDate)

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
              onKeyDown={e => { if (e.key === 'Enter' && form.title.trim()) onSave({ ...form, assigned_to: form.assigned_to || undefined, row_key: rowKey, week_start: weekKey(weekDate) }) }}
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
        </div>
        {error && <div className={styles.modalError}><i className="ti ti-alert-circle" /> {error}</div>}
        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.cancelBtn}>Annuler</button>
          <button
            disabled={!form.title.trim()}
            onClick={() => onSave({
              ...form,
              assigned_to: form.assigned_to || undefined,
              row_key: rowKey,
              week_start: weekKey(weekDate)
            })}
            className={styles.saveBtn}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN ───────────────────────────────────────────────────── */
export default function CalendarView({ supabase, userId, profile, myOnly = false }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [startWeek, setStartWeek] = useState(() => getMondayOfWeek(new Date()))
  const [numWeeks] = useState(8)
  const [addingCell, setAddingCell] = useState<{ week: Date; rowKey: string; rowLabel: string } | null>(null)
  const [filterUser, setFilterUser] = useState<string>(myOnly ? userId : '')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase.from('tasks').select('*').then(({ data }) => setTasks(data || []))
    // Load profiles directly from Supabase (no auth required)
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => {
      if (data && data.length > 0) setProfiles(data)
    })
  }, [])

  const weeks = Array.from({ length: numWeeks }, (_, i) => addWeeks(startWeek, i))

  const getTasksForCell = (rowKey: string, week: Date) => {
    const wk = weekKey(week)
    return tasks.filter(t => t.row_key === rowKey && t.week_start === wk &&
      (!filterUser || t.assigned_to === filterUser))
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
                  {weeks.map(w => {
                    const cellTasks = getTasksForCell(row.key, w)
                    return (
                      <td key={weekKey(w)}
                        className={`${styles.tdCell} ${isThisWeek(w) ? styles.tdToday : ''}`}
                        onClick={() => setAddingCell({ week: w, rowKey: row.key, rowLabel: row.label })}>
                        {cellTasks.map(t => (
                          <TaskChip key={t.id} task={t} profiles={allProfiles}
                            onDelete={() => deleteTask(t.id)} currentUserId={userId} />
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
    </div>
  )
}
