'use client'
import { SectionTree } from '@/lib/types'
import styles from './HomeView.module.css'

interface Props {
  tree: SectionTree[]
  onSelect: (s: SectionTree) => void
}

export default function HomeView({ tree, onSelect }: Props) {
  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h1>Bonjour 👋</h1>
          <p>Plateforme interne HANOA — Lion-en-Sullias, Loiret</p>
        </div>
      </div>

      <p className={styles.sectionLabel}>Rubriques principales</p>
      <div className={styles.grid}>
        {tree.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className={styles.card}>
            <i className={`ti ${s.icon}`} />
            <span className={styles.cardTitle}>{s.label}</span>
            <span className={styles.cardSub}>{s.children.length} sous-rubrique{s.children.length !== 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: '2rem' }}>Sous-rubriques</p>
      <div className={styles.list}>
        {tree.flatMap(s => s.children).map(s => (
          <button key={s.id} onClick={() => onSelect(s)} className={styles.listItem}>
            <i className={`ti ${s.icon}`} style={{ color: 'var(--green)', fontSize: 16 }} />
            <span>{s.label}</span>
            <i className="ti ti-chevron-right" style={{ fontSize: 13, color: '#ccc', marginLeft: 'auto' }} />
          </button>
        ))}
      </div>
    </div>
  )
}
