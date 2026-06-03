'use client'
import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { SectionTree, Section, Profile } from '@/lib/types'
import styles from './HomeView.module.css'

interface Props {
  tree: SectionTree[]
  onSelect: (s: SectionTree) => void
  supabase?: SupabaseClient
  profile?: Profile
  sections?: Section[]
  onCalendar?: () => void
  onCommandes?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  a_preparer: 'À préparer', prepare: 'Préparé', envoye: 'Envoyé', livre: 'Livré'
}
const STATUS_COLORS: Record<string, string> = {
  a_preparer: '#ba7517', prepare: '#185fa5', envoye: '#0f6e56', livre: '#888'
}
const STATUS_BG: Record<string, string> = {
  a_preparer: '#fef3e2', prepare: '#e8f4fd', envoye: '#e8f5ee', livre: '#f0ede6'
}

function fmtDate(d: string) {
  const dt = new Date(d)
  const now = new Date()
  const diff = (now.getTime() - dt.getTime()) / 60000
  if (diff < 1) return 'à l\'instant'
  if (diff < 60) return `il y a ${Math.round(diff)} min`
  if (diff < 1440) return `il y a ${Math.round(diff / 60)}h`
  return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const TASK_CATEGORIES: Record<string, { icon: string; color: string }> = {
  traitement:    { icon: 'ti-bug',        color: '#d85a30' },
  recolte:       { icon: 'ti-scissors',   color: '#ba7517' },
  maintenance:   { icon: 'ti-tool',       color: '#185fa5' },
  irrigation:    { icon: 'ti-droplet',    color: '#0f6e56' },
  fertilisation: { icon: 'ti-plant-2',   color: '#6b4fbb' },
  livraison:     { icon: 'ti-truck',      color: '#888' },
  autre:         { icon: 'ti-calendar',   color: '#5f5e5a' },
}

export default function HomeView({ tree, onSelect, supabase, profile, sections, onCalendar, onCommandes }: Props) {
  const [orders, setOrders] = useState<{ status: string; order_number: string; client: string; id: string }[]>([])
  const [tasks, setTasks] = useState<{ id: string; title: string; due_date: string; category: string; status: string }[]>([])
  const [myTasks, setMyTasks] = useState<{ id: string; title: string; row_key: string; week_start: string; status: string }[]>([])
  const [posts, setPosts] = useState<{ id: string; content: string; section_id: string; created_at: string }[]>([])

  const hour = new Date().getHours()
  const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir'
  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  useEffect(() => {
    if (!supabase) return
    supabase.from('tasks').select('id, title, row_key, week_start, status')
      .eq('assigned_to', profile?.id || '').neq('status', 'fait')
      .gte('week_start', todayStr).order('week_start').limit(5)
      .then(({ data }) => setMyTasks(data || []))
    supabase.from('orders').select('id, status, order_number, client')
      .neq('status', 'livre').order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data || []))
    supabase.from('tasks').select('id, title, due_date, category, status')
      .eq('status', 'a_faire').lte('due_date', tomorrowStr).order('due_date')
      .limit(4)
      .then(({ data }) => setTasks(data || []))
    supabase.from('posts').select('id, content, section_id, created_at')
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setPosts(data || []))
  }, [supabase])

  const sectionMap = new Map(
    (sections || []).map(s => [s.id, s.label])
  )

  const ordersByStatus = {
    a_preparer: orders.filter(o => o.status === 'a_preparer'),
    prepare:    orders.filter(o => o.status === 'prepare'),
    envoye:     orders.filter(o => o.status === 'envoye'),
  }

  return (
    <div className={styles.home}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h1>{greeting}{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p>Projet SOL · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      <div className={styles.dashboard}>
        {/* ── COMMANDES ── */}
        <div className={styles.widget}>
          <div className={styles.widgetHeader}>
            <i className="ti ti-package" style={{ color: '#ba7517' }} />
            <span>Commandes en cours</span>
            <button className={styles.widgetLink} onClick={onCommandes}>Voir tout →</button>
          </div>
          {orders.length === 0 ? (
            <p className={styles.widgetEmpty}>Aucune commande en cours</p>
          ) : (
            <>
              <div className={styles.orderStats}>
                {(['a_preparer', 'prepare', 'envoye'] as const).map(s => (
                  <button key={s} className={styles.orderStat} onClick={onCommandes}
                    style={{ borderColor: STATUS_COLORS[s] + '33' }}>
                    <span className={styles.orderStatNum} style={{ color: STATUS_COLORS[s] }}>
                      {ordersByStatus[s].length}
                    </span>
                    <span className={styles.orderStatLabel}>{STATUS_LABELS[s]}</span>
                  </button>
                ))}
              </div>
              {ordersByStatus.a_preparer.length > 0 && (
                <div className={styles.orderList}>
                  {ordersByStatus.a_preparer.slice(0, 3).map(o => (
                    <button key={o.id} className={styles.orderRow} onClick={onCommandes}>
                      <span className={styles.orderNum}>#{o.order_number}</span>
                      <span className={styles.orderClient}>{o.client}</span>
                      <span className={styles.orderBadge} style={{ color: '#ba7517', background: '#fef3e2' }}>À préparer</span>
                    </button>
                  ))}
                  {ordersByStatus.a_preparer.length > 3 && (
                    <button className={styles.seeMore} onClick={onCommandes}>
                      +{ordersByStatus.a_preparer.length - 3} autres →
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── CALENDRIER ── */}
        <div className={styles.widget}>
          <div className={styles.widgetHeader}>
            <i className="ti ti-calendar" style={{ color: '#185fa5' }} />
            <span>Tâches à venir</span>
            <button className={styles.widgetLink} onClick={onCalendar}>Calendrier →</button>
          </div>
          {tasks.length === 0 ? (
            <p className={styles.widgetEmpty}>Aucune tâche prévue</p>
          ) : (
            <div className={styles.taskList}>
              {tasks.map(t => {
                const cat = TASK_CATEGORIES[t.category] || TASK_CATEGORIES.autre
                const isToday = t.due_date === todayStr
                const isTomorrow = t.due_date === tomorrowStr
                return (
                  <button key={t.id} className={styles.taskRow} onClick={onCalendar}>
                    <div className={styles.taskDot} style={{ background: cat.color }} />
                    <span className={styles.taskTitle}>{t.title}</span>
                    <span className={`${styles.taskDate} ${isToday ? styles.taskToday : ''}`}>
                      {isToday ? 'Aujourd\'hui' : isTomorrow ? 'Demain' : fmtDateShort(t.due_date)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── MON PLANNING ── */}
        {myTasks.length > 0 && (
          <div className={styles.widget}>
            <div className={styles.widgetHeader}>
              <i className="ti ti-user-check" style={{ color: profile?.color || '#0f6e56' }} />
              <span>Mes tâches assignées</span>
              <button className={styles.widgetLink} onClick={onCalendar}>Planning →</button>
            </div>
            <div className={styles.taskList}>
              {myTasks.map(t => {
                const mon = new Date(t.week_start)
                const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
                const rowLabel = t.row_key?.split('_').slice(1).join(' ') || t.row_key || ''
                return (
                  <button key={t.id} className={styles.taskRow} onClick={onCalendar}>
                    <span className={styles.taskDot} style={{ background: profile?.color || '#0f6e56' }} />
                    <span className={styles.taskTitle}>{t.title}</span>
                    <span className={styles.taskDate}>
                      {mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── ACTIVITÉ RÉCENTE ── */}
        <div className={styles.widget} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.widgetHeader}>
            <i className="ti ti-activity" style={{ color: '#0f6e56' }} />
            <span>Derniers messages</span>
          </div>
          {posts.length === 0 ? (
            <p className={styles.widgetEmpty}>Aucun message récent</p>
          ) : (
            <div className={styles.postList}>
              {posts.map(p => {
                const hasMention = p.content.includes('@')
                return (
                  <div key={p.id} className={styles.postRow}>
                    {hasMention && <i className="ti ti-at" style={{ color: '#0f6e56', fontSize: 14, flexShrink: 0 }} />}
                    <span className={styles.postSection}>{sectionMap.get(p.section_id) || '…'}</span>
                    <span className={styles.postContent}>{p.content.slice(0, 80)}{p.content.length > 80 ? '…' : ''}</span>
                    <span className={styles.postDate}>{fmtDate(p.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── RUBRIQUES (compact) ── */}
        <div className={styles.widget} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.widgetHeader}>
            <i className="ti ti-layout-grid" style={{ color: '#5f5e5a' }} />
            <span>Rubriques</span>
          </div>
          <div className={styles.sectionsGrid}>
            {tree.map(s => (
              <button key={s.id} className={styles.sectionBtn} onClick={() => onSelect(s)}>
                <i className={`ti ${s.icon}`} style={{ color: 'var(--green)' }} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
