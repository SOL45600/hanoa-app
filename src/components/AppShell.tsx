'use client'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { Profile, Section, SectionTree, buildTree } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import HomeView from './HomeView'
import FeedView from './FeedView'
import DocsView from './DocsView'
import WeenatView from './WeenatView'
import UsersView from './UsersView'
import SearchView from './SearchView'
import CommandesView from './CommandesView'
import CalendarView from './CalendarView'
import FinanceView from './FinanceView'
import LotsView from './lots/LotsView'
import StockView from './lots/StockView'
import Modal from './Modal'
import styles from './AppShell.module.css'

interface Props {
  user: User
  profile: Profile
  initialSections: Section[]
}

export default function AppShell({ user, profile, initialSections }: Props) {
  const supabase = createClient()
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [selected, setSelected] = useState<SectionTree | null>(null)
  const [view, setView] = useState<'feed' | 'docs'>('feed')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showAddSection, setShowAddSection] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')

  const tree = buildTree(sections)

  // Load unread counts on mount and subscribe to new posts
  useEffect(() => {
    const loadUnread = async () => {
      const { data: reads } = await supabase
        .from('section_reads').select('section_id, last_read_at').eq('user_id', user.id)
      const readMap: Record<string, string> = {}
      reads?.forEach(r => { readMap[r.section_id] = r.last_read_at })

      const counts: Record<string, number> = {}
      await Promise.all(sections.map(async (s) => {
        const lastRead = readMap[s.id]
        const query = supabase.from('posts').select('id', { count: 'exact', head: true })
          .eq('section_id', s.id)
          .neq('author_id', user.id)
        const { count } = lastRead
          ? await query.gt('created_at', lastRead)
          : await query
        if (count && count > 0) counts[s.id] = count
      }))
      setUnreadCounts(counts)
    }
    loadUnread()

    // Realtime: increment badge when new post arrives in any section
    const channel = supabase.channel('global-posts')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
      }, (payload) => {
        const post = payload.new as { section_id: string; author_id: string }
        if (post.author_id !== user.id) {
          setUnreadCounts(prev => ({ ...prev, [post.section_id]: (prev[post.section_id] || 0) + 1 }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sections.length])

  const markSectionRead = async (sectionId: string) => {
    setUnreadCounts(prev => { const n = { ...prev }; delete n[sectionId]; return n })
    await supabase.from('section_reads').upsert({
      user_id: user.id, section_id: sectionId, last_read_at: new Date().toISOString()
    }, { onConflict: 'user_id,section_id' })
  }

  const handleAddSection = async () => {
    if (!newName.trim()) return
    const maxOrder = sections.filter(s => s.parent_id === (newParent || null)).length
    const { data, error } = await supabase
      .from('sections')
      .insert({ label: newName.trim(), icon: 'ti-folder', parent_id: newParent || null, sort_order: maxOrder })
      .select()
      .single()
    if (!error && data) {
      setSections(s => [...s, data])
      setNewName('')
      setNewParent('')
      setShowAddSection(false)
    }
  }

  const handleDeleteSection = async (id: string) => {
    if (!confirm('Supprimer cette rubrique et tout son contenu ?')) return
    const { error } = await supabase.from('sections').delete().eq('id', id)
    if (!error) {
      setSections(s => s.filter(sec => sec.id !== id && sec.parent_id !== id))
      if (selected?.id === id) setSelected(null)
    }
  }

  const handleRenameSection = async (id: string, label: string) => {
    const { error } = await supabase.from('sections').update({ label }).eq('id', id)
    if (!error) {
      setSections(s => s.map(sec => sec.id === id ? { ...sec, label } : sec))
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, label } : prev)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const flatSections = sections.sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className={styles.shell}>
      {sidebarOpen && (
        <>
          <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
          <Sidebar
            tree={tree}
            sections={sections}
            selected={selected}
            onSelect={(s) => { setSelected(s); setView('feed'); setShowCalendar(false); setShowUsers(false); setShowSearch(false); markSectionRead(s.id); setSidebarOpen(window.innerWidth > 640) }}
            unreadCounts={unreadCounts}
            onHome={() => { setSelected(null); setShowUsers(false); setShowSearch(false); setSidebarOpen(window.innerWidth > 640) }}
            onUsers={() => { setShowUsers(true); setSelected(null); setSidebarOpen(window.innerWidth > 640) }}
            onCalendar={() => {
              const plan = sections.find(s => s.label.toLowerCase() === 'planning')
              if (plan) { setSelected(plan as SectionTree); setShowUsers(false) }
              setSidebarOpen(window.innerWidth > 640)
            }}
            showCalendar={selected?.label.toLowerCase() === 'planning'}
            onClose={() => setSidebarOpen(false)}
            onAddSection={() => setShowAddSection(true)}
            onDelete={handleDeleteSection}
            onRename={handleRenameSection}
            profile={profile}
            onLogout={handleLogout}
          />
        </>
      )}
      <div className={styles.main}>
        <TopBar
          section={selected}
          view={view}
          setView={setView}
          profile={profile}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          onSearch={() => { setShowSearch(s => !s); setShowUsers(false) }}
          isSearching={showSearch}
          onBack={() => {
            if (selected?.parent_id) {
              const parent = sections.find(s => s.id === selected.parent_id)
              if (parent) setSelected(parent as SectionTree)
            } else {
              setSelected(null)
            }
          }}
        />
        <div className={styles.content}>
          {showSearch && <SearchView supabase={supabase} sections={sections} onNavigate={(sid, v) => { setSelected(sections.find(s => s.id === sid) as SectionTree || null); setView(v); setShowSearch(false) }} />}
          {showUsers && !showSearch && <UsersView currentUserId={user.id} />}
          {!showUsers && !showSearch && !selected && (
            <HomeView
              tree={tree}
              onSelect={(s) => { setSelected(s); setView('feed') }}
              supabase={supabase}
              profile={profile}
              sections={sections}
              onCalendar={() => {
                const plan = sections.find(s => s.label.toLowerCase() === 'planning')
                if (plan) setSelected(plan as SectionTree)
              }}
              onCommandes={() => {
                const cmd = sections.find(s => s.label.toLowerCase() === 'commandes')
                if (cmd) setSelected(cmd as SectionTree)
              }}
              onNavigateSection={(sectionId) => {
                const sec = sections.find(s => s.id === sectionId)
                if (sec) { setSelected(sec as SectionTree); setView('feed') }
              }}
            />
          )}
          {!showUsers && selected && selected.label.toLowerCase() === 'planning' && (
            <CalendarView supabase={supabase} userId={user.id} profile={profile} sections={sections} />
          )}
          {!showUsers && selected && selected.label.toLowerCase() === 'finance' && (
            <FinanceView profile={profile} />
          )}
          {!showUsers && selected && selected.label.toLowerCase() === 'lots' && (
            <LotsView supabase={supabase} userId={user.id} profile={profile} />
          )}
          {!showUsers && selected && selected.label.toLowerCase() === 'stock' && (
            <StockView supabase={supabase} />
          )}
          {!showUsers && selected && selected.label.toLowerCase().includes('irrigation') && <WeenatView />}
          {!showUsers && selected && selected.label.toLowerCase() === 'commandes' && (
            <CommandesView sectionId={selected.id} userId={user.id} profile={profile} supabase={supabase} />
          )}
          {!showUsers && !showSearch && selected &&
            selected.label.toLowerCase() !== 'planning' &&
            selected.label.toLowerCase() !== 'finance' &&
            selected.label.toLowerCase() !== 'lots' &&
            selected.label.toLowerCase() !== 'stock' &&
            !selected.label.toLowerCase().includes('irrigation') &&
            selected.label.toLowerCase() !== 'commandes' &&
            view === 'feed' && (
            <FeedView sectionId={selected.id} userId={user.id} profile={profile} supabase={supabase} />
          )}
          {!showUsers && selected &&
            selected.label.toLowerCase() !== 'planning' &&
            selected.label.toLowerCase() !== 'finance' &&
            selected.label.toLowerCase() !== 'lots' &&
            selected.label.toLowerCase() !== 'stock' &&
            !selected.label.toLowerCase().includes('irrigation') &&
            selected.label.toLowerCase() !== 'commandes' &&
            view === 'docs' && (
            <DocsView sectionId={selected.id} userId={user.id} profile={profile} supabase={supabase} />
          )}
        </div>
      </div>

      {showAddSection && (
        <Modal title="Nouvelle rubrique" onClose={() => setShowAddSection(false)}>
          <div className={styles.addForm}>
            <div>
              <label>Nom de la rubrique</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Ex : Récolte, Comptabilité…" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAddSection() }} />
            </div>
            <div>
              <label>Sous-rubrique de (optionnel)</label>
              <select value={newParent} onChange={e => setNewParent(e.target.value)}>
                <option value="">— Rubrique principale —</option>
                {flatSections.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAddSection} className={styles.btnGreen}>
              Créer la rubrique
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
