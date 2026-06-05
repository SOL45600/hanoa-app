'use client'
import { SectionTree, Profile } from '@/lib/types'
import styles from './TopBar.module.css'

interface Props {
  section: SectionTree | null
  view: 'feed' | 'docs'
  setView: (v: 'feed' | 'docs') => void
  profile: Profile
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onSearch: () => void
  isSearching: boolean
  onBack?: () => void // back to parent section on mobile
}

export default function TopBar({ section, view, setView, profile, sidebarOpen, onToggleSidebar, onSearch, isSearching, onBack }: Props) {
  return (
    <div className={styles.bar}>
      {!sidebarOpen && (
        <button onClick={onToggleSidebar} className={styles.menuBtn} title="Ouvrir le menu">
          <i className="ti ti-layout-sidebar" style={{ fontSize: 18 }} />
        </button>
      )}
      {!sidebarOpen && onBack && section && (
        <button onClick={onBack} className={styles.backBtn} title="Retour">
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </button>
      )}
      <div className={styles.title}>
        <h2>{isSearching ? 'Recherche' : section ? section.label : 'Accueil'}</h2>
      </div>
      <button onClick={onSearch} className={`${styles.searchBtn} ${isSearching ? styles.searchActive : ''}`} title="Rechercher">
        <i className="ti ti-search" style={{ fontSize: 16 }} />
      </button>
      {section && !isSearching && (
        <div className={styles.viewToggle}>
          {([['feed', 'ti-messages', 'Feed'], ['docs', 'ti-files', 'Documents']] as const).map(([k, icon, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={`${styles.viewBtn} ${view === k ? styles.viewActive : ''}`}>
              <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
