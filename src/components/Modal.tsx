'use client'
import styles from './Modal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export default function Modal({ title, onClose, children }: Props) {
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>{title}</h3>
          <button onClick={onClose} className={styles.closeBtn}>
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
