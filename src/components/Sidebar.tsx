'use client'
import { useState, useRef, useEffect } from 'react'
import { SectionTree, Section, Profile } from '@/lib/types'
import styles from './Sidebar.module.css'

interface Props {
  tree: SectionTree[]
  sections: Section[]
  selected: SectionTree | null
  onSelect: (s: SectionTree) => void
  onHome: () => void
  onClose: () => void
  onAddSection: () => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onUsers: () => void
  onCalendar: () => void
  showCalendar: boolean
  unreadCounts?: Record<string, number>
  profile: Profile
  onLogout: () => void
}

function Avatar({ profile, size = 28 }: { profile: Profile; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: profile.color + '22', border: `1.5px solid ${profile.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 500, color: profile.color, flexShrink: 0
    }}>
      {profile.initials}
    </div>
  )
}

function SectionNode({ node, depth, selected, onSelect, onDelete, onRename, unreadCounts }: {
  node: SectionTree; depth: number; selected: SectionTree | null
  onSelect: (s: SectionTree) => void; onDelete: (id: string) => void; onRename: (id: string, label: string) => void
  unreadCounts?: Record<string, number>
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isSel = selected?.id === node.id
  const hasChildren = node.children.length > 0

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); setEditVal(node.label) }
  }, [editing])

  const confirmRename = () => {
    if (editVal.trim() && editVal !== node.label) onRename(node.id, editVal.trim())
    setEditing(false)
  }

  return (
    <div>
      <div
        className={`${styles.node} ${isSel ? styles.selected : ''}`}
        style={{ paddingLeft: 14 + depth * 14 }}
        onClick={() => { if (!editing) { onSelect(node); if (hasChildren) setExpanded(e => !e) } }}
      >
        {hasChildren
          ? <i className={`ti ${expanded ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize: 12, color: '#888', flexShrink: 0 }} />
          : <span style={{ width: 12, flexShrink: 0 }} />
        }
        <i className={`ti ${node.icon}`} style={{ fontSize: 15, flexShrink: 0, color: isSel ? 'var(--green)' : '#888' }} />
        {editing
          ? <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
              className={styles.editInput}
              onBlur={confirmRename}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false) }}
              onClick={e => e.stopPropagation()} />
          : (
            <span className={styles.label}>
              {node.label}
              {unreadCounts?.[node.id] ? (
                <span className={styles.unread}>{unreadCounts[node.id]}</span>
              ) : null}
            </span>
          )
        }
        {!editing && isSel && (
          <div className={styles.actions} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditing(true)} title="Renommer">
              <i className="ti ti-edit" style={{ fontSize: 12 }} />
            </button>
            <button onClick={() => onDelete(node.id)} title="Supprimer" style={{ color: '#993c1d' }}>
              <i className="ti ti-trash" style={{ fontSize: 12 }} />
            </button>
          </div>
        )}
      </div>
      {hasChildren && expanded && node.children.map(c => (
        <SectionNode key={c.id} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} onDelete={onDelete} onRename={onRename} unreadCounts={unreadCounts} />
      ))}
    </div>
  )
}

export default function Sidebar({ tree, sections, selected, onSelect, onHome, onClose, onAddSection, onDelete, onRename, onUsers, onCalendar, showCalendar, unreadCounts, profile, onLogout }: Props) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <button onClick={onHome} className={styles.logoBtn} title="Accueil">
          <div className={styles.logo}><i className="ti ti-leaf" /></div>
          <span className={styles.brand}>Projet SOL</span>
        </button>
        <button onClick={onClose} className={styles.closeBtn} title="Fermer">
          <i className="ti ti-layout-sidebar-left-collapse" style={{ fontSize: 16 }} />
        </button>
      </div>

      <div className={styles.nav}>
        <button className={`${styles.homeBtn} ${!selected && !showCalendar ? styles.homeBtnActive : ''}`} onClick={onHome}>
          <i className="ti ti-home" style={{ fontSize: 15 }} />
          <span>Accueil</span>
        </button>
        <button className={`${styles.homeBtn} ${showCalendar ? styles.homeBtnActive : ''}`} onClick={onCalendar}>
          <i className="ti ti-calendar" style={{ fontSize: 15 }} />
          <span>Planning</span>
        </button>
        <p className={styles.navLabel}>Rubriques</p>
        {tree.map(node => (
          <SectionNode key={node.id} node={node} depth={0} selected={selected}
            onSelect={onSelect} onDelete={onDelete} onRename={onRename} unreadCounts={unreadCounts} />
        ))}
        <button onClick={onAddSection} className={styles.addBtn}>
          <i className="ti ti-plus" style={{ fontSize: 14 }} />
          Nouvelle rubrique
        </button>
      </div>

      <div className={styles.footer}>
        <Avatar profile={profile} size={30} />
        <div className={styles.footerInfo}>
          <span className={styles.footerName}>{profile.full_name}</span>
        </div>
        <button onClick={onUsers} title="Utilisateurs" className={styles.logoutBtn}>
          <i className="ti ti-users" style={{ fontSize: 16 }} />
        </button>
        <button onClick={onLogout} title="Déconnexion" className={styles.logoutBtn}>
          <i className="ti ti-logout" style={{ fontSize: 16 }} />
        </button>
      </div>
    </div>
  )
}
