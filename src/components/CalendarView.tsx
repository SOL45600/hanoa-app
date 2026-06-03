'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile, Section } from '@/lib/types'
import styles from './CalendarView.module.css'

interface Task {
  id: string
  title: string
  description?: string
  section_id?: string
  assigned_to?: string
  created_by: string
  due_date: string
  due_time?: string
  category: string
  status: string
  created_at: string
}

const CATEGORIES = [
  { key: 'traitement',  label: 'Traitement phyto', color: '#d85a30', icon: 'ti-bug' },
  { key: 'recolte',     label: 'Récolte',           color: '#ba7517', icon: 'ti-scissors' },
  { key: 'maintenance', label: 'Maintenance',       color: '#185fa5', icon: 'ti-tool' },
  { key: 'irrigation',  label: 'Irrigation',        color: '#0f6e56', icon: 'ti-droplet' },
  { key: 'fertilisation', label: 'Fertilisation',   color: '#6b4fbb', icon: 'ti-plant-2' },
  { key: 'livraison',   label: 'Livraison',         color: '#888',    icon: 'ti-truck' },
  { key: 'autre',       label: 'Autre',             color: '#5f5e5a', icon: 'ti-calendar' },
]

const STATUSES = {
  a_faire:   { label: 'À faire',    color: '#ba7517', bg: '#fef3e2' },
  en_cours:  { label: 'En cours',   color: '#185fa5', bg: '#e8f4fd' },
  fait:      { label: 'Fait',       color: '#0f6e56', bg: '#e8f5ee' },
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS = ['L','M','M','J','V','S','D']

function getCat(key: string) { return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1] }
function fmtTime(t?: string) { return t ? t.slice(0, 5) : '' }

export default function CalendarView({ supabase, userId, profile, sections }: {
  supabase: SupabaseClient; userId: string; profile: Profile; sections: Section[]
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const [showForm, setShowForm] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState({
    title: '', description: '', section_id: '', assigned_to: '',
    due_date: today.toISOString().slice(0, 10), due_time: '',
    category: 'autre', status: 'a_faire',
  })

  useEffect(() => {
    supabase.from('tasks').select('*').then(({ data }) => setTasks(data || []))
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setProfiles(d) })
  }, [])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0

  const getTasksForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return tasks.filter(t => t.due_date === dateStr)
  }

  const dayTasks = selectedDay ? getTasksForDay(selectedDay) : []

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('tasks')
      .insert({ ...form, created_by: userId, section_id: form.section_id || null, assigned_to: form.assigned_to || null })
      .select('*').single()
    if (!error && data) {
      setTasks(ts => [...ts, data])
      setShowForm(false)
      setForm(f => ({ ...f, title: '', description: '' }))
    }
  }

  const toggleStatus = async (task: Task) => {
    const order = ['a_faire', 'en_cours', 'fait']
    const next = order[(order.indexOf(task.status) + 1) % order.length]
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(ts => ts.filter(t => t.id !== id))
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2>Calendrier des tâches</h2>
        <button className={styles.addBtn} onClick={() => {
          setForm(f => ({ ...f, due_date: selectedDay ? `${year}-${String(month+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}` : f.due_date }))
          setShowForm(true)
        }}>
          <i className="ti ti-plus" /> Nouvelle tâche
        </button>
      </div>

      <div className={styles.layout}>
        {/* Calendar */}
        <div className={styles.cal}>
          <div className={styles.calNav}>
            <button onClick={prevMonth}><i className="ti ti-chevron-left" /></button>
            <span>{MONTHS[month]} {year}</span>
            <button onClick={nextMonth}><i className="ti ti-chevron-right" /></button>
          </div>
          <div className={styles.calGrid}>
            {DAYS.map((d, i) => <div key={i} className={styles.calDayName}>{d}</div>)}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayTasks = getTasksForDay(day)
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSel = day === selectedDay
              return (
                <button key={day} className={`${styles.calDay} ${isToday ? styles.today : ''} ${isSel ? styles.selected : ''}`}
                  onClick={() => setSelectedDay(day)}>
                  <span>{day}</span>
                  {dayTasks.length > 0 && (
                    <div className={styles.calDots}>
                      {dayTasks.slice(0, 3).map(t => (
                        <span key={t.id} className={styles.calDot}
                          style={{ background: getCat(t.category).color }} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            {CATEGORIES.map(c => (
              <span key={c.key} className={styles.legendItem}>
                <span style={{ background: c.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Day detail */}
        <div className={styles.dayDetail}>
          {selectedDay && (
            <>
              <div className={styles.dayTitle}>
                {selectedDay} {MONTHS[month]} {year}
                <span className={styles.taskCount}>{dayTasks.length} tâche{dayTasks.length > 1 ? 's' : ''}</span>
              </div>
              {dayTasks.length === 0 && (
                <div className={styles.empty}>
                  <i className="ti ti-calendar-off" />
                  <span>Aucune tâche ce jour</span>
                </div>
              )}
              {dayTasks.map(t => {
                const cat = getCat(t.category)
                const st = STATUSES[t.status as keyof typeof STATUSES] || STATUSES.a_faire
                return (
                  <div key={t.id} className={styles.taskCard}>
                    <div className={styles.taskCatDot} style={{ background: cat.color }} />
                    <div className={styles.taskBody}>
                      <div className={styles.taskHeader}>
                        <span className={styles.taskTitle}>{t.title}</span>
                        <button className={styles.taskDelete} onClick={() => deleteTask(t.id)} title="Supprimer">
                          <i className="ti ti-trash" style={{ fontSize: 12 }} />
                        </button>
                      </div>
                      {t.description && <p className={styles.taskDesc}>{t.description}</p>}
                      <div className={styles.taskMeta}>
                        {t.due_time && <span><i className="ti ti-clock" /> {fmtTime(t.due_time)}</span>}
                        <span style={{ color: cat.color }}><i className={`ti ${cat.icon}`} /> {cat.label}</span>
                        <button className={styles.taskStatus} style={{ color: st.color, background: st.bg }}
                          onClick={() => toggleStatus(t)}>
                          {st.label}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* New task form */}
      {showForm && (
        <div className={styles.formOverlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <form className={styles.form} onSubmit={submitTask}>
            <div className={styles.formHeader}>
              <h3>Nouvelle tâche</h3>
              <button type="button" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                <label>Titre *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Traitement fongicide parcelle D" />
              </div>
              <div className={styles.field}>
                <label>Date *</label>
                <input type="date" required value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Heure</label>
                <input type="time" value={form.due_time} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Catégorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Assigner à</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                  <option value="">— Non assigné —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Rubrique liée</label>
                <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}>
                  <option value="">— Aucune —</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Détails, quantités, notes…" />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" onClick={() => setShowForm(false)} className={styles.cancelBtn}>Annuler</button>
              <button type="submit" className={styles.saveBtn}>Créer la tâche</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
