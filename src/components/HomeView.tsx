'use client'
import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { SectionTree, Profile } from '@/lib/types'
import styles from './HomeView.module.css'

interface Props {
  tree: SectionTree[]
  onSelect: (s: SectionTree) => void
  supabase?: SupabaseClient
  profile?: Profile
  onCalendar?: () => void
}

interface Stats {
  postsToday: number
  docsTotal: number
  tasksDue: number
  recentActivity: { type: string; label: string; section: string; date: string }[]
}

function fmtDate(d: string) {
  const dt = new Date(d)
  const now = new Date()
  const diff = (now.getTime() - dt.getTime()) / 60000
  if (diff < 1) return 'à l'instant'
  if (diff < 60) return `il y a ${Math.round(diff)} min`
  if (diff < 1440) return `il y a ${Math.round(diff / 60)}h`
  return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function HomeView({ tree, onSelect, supabase, profile, onCalendar }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!supabase) return
    const load = async () => {
      const todayStr = new Date().toISOString().slice(0, 10)
      const [{ data: postsToday }, { data: docs }, { data: tasksDue }, { data: recentPosts }, { data: recentDocs }] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact' }).gte('created_at', todayStr),
        supabase.from('documents').select('id', { count: 'exact' }),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'a_faire').lte('due_date', todayStr),
        supabase.from('posts').select('id, content, section_id, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('documents').select('id, name, section_id, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      const sectionMap = new Map(tree.flatMap(s => [s, ...s.children]).map(s => [s.id, s.label]))

      const activity = [
        ...(recentPosts || []).map(p => ({
          type: 'post', icon: 'ti-message', color: '#0f6e56',
          label: p.content.slice(0, 60) + (p.content.length > 60 ? '…' : ''),
          section: sectionMap.get(p.section_id) || '…', date: p.created_at,
        })),
        ...(recentDocs || []).map(d => ({
          type: 'doc', icon: 'ti-file', color: '#185fa5',
          label: d.name,
          section: sectionMap.get(d.section_id) || '…', date: d.created_at,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)

      setStats({
        postsToday: postsToday?.length || 0,
        docsTotal: docs?.length || 0,
        tasksDue: tasksDue?.length || 0,
        recentActivity: activity,
      })
    }
    load()
  }, [supabase, tree])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bonjour' : 'Bonsoir'

  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h1>{greeting}{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p>Projet SOL — Lion-en-Sullias, Loiret</p>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <i className="ti ti-messages" style={{ color: '#0f6e56' }} />
            <span className={styles.kpiValue}>{stats.postsToday}</span>
            <span className={styles.kpiLabel}>message{stats.postsToday !== 1 ? 's' : ''} aujourd'hui</span>
          </div>
          <div className={styles.kpi}>
            <i className="ti ti-files" style={{ color: '#185fa5' }} />
            <span className={styles.kpiValue}>{stats.docsTotal}</span>
            <span className={styles.kpiLabel}>document{stats.docsTotal !== 1 ? 's' : ''}</span>
          </div>
          <button className={`${styles.kpi} ${styles.kpiClickable}`} onClick={onCalendar}>
            <i className="ti ti-calendar-check" style={{ color: stats.tasksDue > 0 ? '#d85a30' : '#ba7517' }} />
            <span className={styles.kpiValue} style={{ color: stats.tasksDue > 0 ? '#d85a30' : undefined }}>{stats.tasksDue}</span>
            <span className={styles.kpiLabel}>tâche{stats.tasksDue !== 1 ? 's' : ''} à faire</span>
          </button>
        </div>
      )}

      <div className={styles.twoCol}>
        {/* Sections */}
        <div>
          <p className={styles.sectionLabel}>Rubriques</p>
          <div className={styles.grid}>
            {tree.map(s => (
              <button key={s.id} onClick={() => onSelect(s)} className={styles.card}>
                <i className={`ti ${s.icon}`} />
                <span className={styles.cardTitle}>{s.label}</span>
                <span className={styles.cardSub}>{s.children.length} sous-rubrique{s.children.length !== 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        {stats && stats.recentActivity.length > 0 && (
          <div>
            <p className={styles.sectionLabel}>Activité récente</p>
            <div className={styles.activityList}>
              {stats.recentActivity.map((a, i) => (
                <div key={i} className={styles.activityItem}>
                  <div className={styles.activityIcon} style={{ background: a.color + '18' }}>
                    <i className={`ti ${a.icon}`} style={{ color: a.color, fontSize: 14 }} />
                  </div>
                  <div className={styles.activityBody}>
                    <span className={styles.activityLabel}>{a.label}</span>
                    <span className={styles.activityMeta}>{a.section} · {fmtDate(a.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
