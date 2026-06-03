'use client'
import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import styles from './DocPreview.module.css'

interface Props {
  storagePath: string
  fileName: string
  mimeType?: string
  supabase: SupabaseClient
  onClose: () => void
}

function getFileType(name: string, mime?: string): 'pdf' | 'image' | 'office' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || mime?.startsWith('image/')) return 'image'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office'
  return 'other'
}

export default function DocPreview({ storagePath, fileName, mimeType, supabase, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Get signed URL on mount
  useState(() => {
    supabase.storage.from('hanoa-files').createSignedUrl(storagePath, 3600)
      .then(({ data, error: err }) => {
        if (err || !data?.signedUrl) {
          setError('Impossible d\'accéder au fichier')
        } else {
          setUrl(data.signedUrl)
        }
        setLoading(false)
      })
  })

  const fileType = getFileType(fileName, mimeType)

  const renderContent = () => {
    if (loading) return (
      <div className={styles.center}>
        <i className="ti ti-loader" style={{ fontSize: 30, animation: 'spin 1s linear infinite', color: '#888' }} />
        <p>Chargement…</p>
      </div>
    )

    if (error || !url) return (
      <div className={styles.center}>
        <i className="ti ti-alert-circle" style={{ fontSize: 30, color: '#d85a30' }} />
        <p>{error || 'Fichier indisponible'}</p>
      </div>
    )

    if (fileType === 'pdf') {
      return (
        <iframe
          src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
          className={styles.iframe}
          title={fileName}
        />
      )
    }

    if (fileType === 'image') {
      return (
        <div className={styles.imageContainer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={fileName} className={styles.image} />
        </div>
      )
    }

    if (fileType === 'office') {
      return (
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
          className={styles.iframe}
          title={fileName}
        />
      )
    }

    return (
      <div className={styles.center}>
        <i className="ti ti-file" style={{ fontSize: 40, color: '#888' }} />
        <p>Aperçu non disponible pour ce format</p>
        <a href={url} download={fileName} className={styles.downloadBtn}>
          <i className="ti ti-download" /> Télécharger
        </a>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{fileName}</span>
          <div className={styles.actions}>
            {url && (
              <a href={url} download={fileName} className={styles.iconBtn} title="Télécharger">
                <i className="ti ti-download" style={{ fontSize: 16 }} />
              </a>
            )}
            <button onClick={onClose} className={styles.iconBtn} title="Fermer">
              <i className="ti ti-x" style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>
        <div className={styles.content}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
