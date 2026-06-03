'use client'
import { useState, useCallback } from 'react'
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
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')

  const tree = buildTree(sections)

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
            onSelect={(s) => { setSelected(s); setView('feed'); setSidebarOpen(window.innerWidth > 640) }}
            onHome={() => { setSelected(null); setShowUsers(false); setSidebarOpen(window.innerWidth > 640) }}
            onUsers={() => { setShowUsers(true); setSelected(null); setSidebarOpen(window.innerWidth > 640) }}
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
        />
        <div className={styles.content}>
          {showUsers && <UsersView currentUserId={user.id} />}
          {!showUsers && !selected && <HomeView tree={tree} onSelect={(s) => { setSelected(s); setView('feed') }} />}
          {!showUsers && selected && selected.label.toLowerCase().includes('irrigation') && <WeenatView />}
          {!showUsers && selected && !selected.label.toLowerCase().includes('irrigation') && view === 'feed' && (
            <FeedView sectionId={selected.id} userId={user.id} profile={profile} supabase={supabase} />
          )}
          {!showUsers && selected && view === 'docs' && (
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
