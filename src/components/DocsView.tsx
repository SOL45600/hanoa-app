'use client'
import { useState, useEffect, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Document, Comment, Profile } from '@/lib/types'
import Avatar from './Avatar'
import DocPreview from './DocPreview'
import styles from './DocsView.module.css'

interface Props {
  sectionId: string
  userId: string
  profile: Profile
  supabase: SupabaseClient
}

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf:  { icon: 'ti-file-type-pdf', color: '#d85a30' },
  doc:  { icon: 'ti-file-type-doc', color: '#185fa5' },
  docx: { icon: 'ti-file-type-doc', color: '#185fa5' },
  xls:  { icon: 'ti-file-spreadsheet', color: '#1d9e75' },
  xlsx: { icon: 'ti-file-spreadsheet', color: '#1d9e75' },
  jpg:  { icon: 'ti-photo', color: '#0f6e56' },
  jpeg: { icon: 'ti-photo', color: '#0f6e56' },
  png:  { icon: 'ti-photo', color: '#0f6e56' },
  gif:  { icon: 'ti-photo', color: '#0f6e56' },
  mp4:  { icon: 'ti-video', color: '#ba7517' },
  mov:  { icon: 'ti-video', color: '#ba7517' },
  txt:  { icon: 'ti-file-text', color: '#5f5e5a' },
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtSize = (b: number) => b < 1024 ? `${b} o` : b < 1048576 ? `${(b/1024).toFixed(0)} Ko` : `${(b/1048576).toFixed(1)} Mo`

function CommentThread({ comments, currentProfile, onAdd }: { comments: Comment[]; currentProfile: Profile; onAdd: (t: string) => void }) {
  const [text, setText] = useState('')
  const submit = () => { if (text.trim()) { onAdd(text); setText('') } }
  return (
    <div className={styles.thread}>
      {comments.map(c => (
        <div key={c.id} className={styles.comment}>
          <Avatar profile={c.profiles || currentProfile} size={24} />
          <div className={styles.bubble}>
            <span className={styles.cAuthor}>{c.profiles?.full_name || '…'}</span>
            <span className={styles.cDate}>{fmtDate(c.created_at)}</span>
            <p>{c.content}</p>
          </div>
        </div>
      ))}
      <div className={styles.cInput}>
        <Avatar profile={currentProfile} size={24} />
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Commenter…"
          onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        <button onClick={submit}>↵</button>
      </div>
    </div>
  )
}

export default function DocsView({ sectionId, userId, profile, supabase }: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [localFolders, setLocalFolders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<Document | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  // Realtime subscription for documents
  useEffect(() => {
    const channel = supabase
      .channel(`docs:${sectionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'documents',
        filter: `section_id=eq.${sectionId}`,
      }, (payload) => {
        const newDoc = payload.new as Document
        if (newDoc.author_id !== userId) {
          setDocs(prev => [newDoc, ...prev])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sectionId])

  useEffect(() => {
    setLoading(true)
    setCurrentFolder(null)
    setLocalFolders([])
    supabase
      .from('documents')
      .select('*')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocs(data || []); setLoading(false) })
  }, [sectionId])

  const allFolders = Array.from(
    new Set([...(docs.map(d => d.folder).filter(Boolean) as string[]), ...localFolders])
  ).sort((a, b) => a.localeCompare(b))
  const visibleDocs = currentFolder === null ? docs : docs.filter(d => (d.folder || null) === currentFolder)

  const newFolder = () => {
    const name = prompt('Nom du nouveau dossier :')?.trim()
    if (!name) return
    setLocalFolders(f => Array.from(new Set([...f, name])))
    setCurrentFolder(name)
  }
  const moveDoc = async (docId: string, folder: string | null) => {
    await supabase.from('documents').update({ folder }).eq('id', docId)
    setDocs(ds => ds.map(d => d.id === docId ? { ...d, folder } : d))
  }

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const path = `${userId}/${sectionId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('hanoa-files').upload(path, file)
      if (!uploadError) {
        const { data, error } = await supabase
          .from('documents')
          .insert({
            section_id: sectionId,
            author_id: userId,
            name: file.name,
            storage_path: path,
            mime_type: file.type,
            size_bytes: file.size,
            folder: currentFolder,
          })
          .select('*')
          .single()
        if (!error && data) setDocs(d => [data, ...d])
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(Array.from(e.target.files || []))
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items.length > 0) setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOver(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragOver(false); dragCounter.current = 0
    const files = Array.from(e.dataTransfer.files)
    if (files.length) uploadFiles(files)
  }

  const getDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from('hanoa-files').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const addComment = async (docId: string, content: string) => {
    const { data, error } = await supabase
      .from('comments')
      .insert({ document_id: docId, author_id: userId, content })
      .select('*')
      .single()
    if (!error && data) {
      setDocs(ds => ds.map(d => d.id === docId ? { ...d, comments: [...(d.comments || []), data] } : d))
    }
  }

  return (
    <div
      className={`${styles.docs} ${dragOver ? styles.dragOver : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className={styles.dropOverlay}>
          <i className="ti ti-upload" style={{ fontSize: 40, color: 'var(--green)' }} />
          <p>Déposez vos fichiers ici</p>
        </div>
      )}
      <input type="file" ref={fileRef} style={{ display: 'none' }} multiple onChange={handleInputChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.mp4,.mov,.txt" />
      <button onClick={() => fileRef.current?.click()} className={styles.uploadBtn} disabled={uploading}>
        <i className={`ti ${uploading ? 'ti-loader' : 'ti-upload'}`} style={{ fontSize: 18 }} />
        {uploading ? 'Envoi en cours…' : (currentFolder ? `Ajouter dans « ${currentFolder} » ou glisser-déposer` : 'Ajouter ou glisser-déposer un document ici')}
      </button>

      {/* Dossiers */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 4px' }}>
        {([null, ...allFolders] as (string | null)[]).map(f => {
          const active = currentFolder === f
          return (
            <button key={f ?? '__all'} onClick={() => setCurrentFolder(f)}
              style={{ padding: '5px 12px', borderRadius: 16, fontSize: 13, border: '0.5px solid var(--border-mid)',
                background: active ? 'var(--green-light)' : 'white', color: active ? 'var(--green)' : 'var(--text)' }}>
              {f === null ? 'Tous' : <><i className="ti ti-folder" style={{ fontSize: 13, marginRight: 4 }} />{f}</>}
            </button>
          )
        })}
        <button onClick={newFolder}
          style={{ padding: '5px 12px', borderRadius: 16, fontSize: 13, border: '0.5px dashed var(--border-mid)', background: 'white', color: 'var(--green)' }}>
          <i className="ti ti-folder-plus" style={{ fontSize: 13, marginRight: 4 }} />Nouveau dossier
        </button>
      </div>

      {loading && <p className={styles.empty}>Chargement…</p>}
      {!loading && visibleDocs.length === 0 && (
        <div className={styles.empty}>
          <i className="ti ti-files" />
          <span>{currentFolder ? `Aucun document dans « ${currentFolder} »` : 'Aucun document dans cette rubrique'}</span>
        </div>
      )}

      {preview && (
        <DocPreview
          storagePath={preview.storage_path}
          fileName={preview.name}
          mimeType={preview.mime_type}
          supabase={supabase}
          onClose={() => setPreview(null)}
        />
      )}

      {visibleDocs.map(doc => {
        const ext = doc.name.split('.').pop()?.toLowerCase() || ''
        const cfg = FILE_ICONS[ext] || { icon: 'ti-file', color: '#5f5e5a' }
        return (
          <div key={doc.id} className={styles.doc}>
            <div className={styles.docIcon}>
              <i className={`ti ${cfg.icon}`} style={{ color: cfg.color, fontSize: 22 }} />
            </div>
            <div className={styles.docInfo}>
              <div className={styles.docHeader}>
                <button className={styles.docName} onClick={() => setPreview(doc)} title="Visualiser">
                  {doc.name}
                </button>
                <div className={styles.docActions}>
                  <button onClick={() => setPreview(doc)} className={styles.actionBtn} title="Visualiser">
                    <i className="ti ti-eye" style={{ fontSize: 15 }} />
                  </button>
                  <button onClick={() => getDownloadUrl(doc.storage_path)} className={styles.actionBtn} title="Télécharger">
                    <i className="ti ti-download" style={{ fontSize: 15 }} />
                  </button>
                  <select value={doc.folder || ''} onChange={e => moveDoc(doc.id, e.target.value || null)}
                    title="Déplacer vers un dossier"
                    style={{ fontSize: 11, border: '0.5px solid var(--border-mid)', borderRadius: 6, padding: '2px 4px', maxWidth: 120, color: 'var(--muted)' }}>
                    <option value="">Sans dossier</option>
                    {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  {doc.author_id === userId && (
                    <button className={`${styles.actionBtn} ${styles.deleteBtn}`} title="Supprimer"
                      onClick={async () => {
                        if (!confirm(`Supprimer "${doc.name}" ?`)) return
                        await supabase.storage.from('hanoa-files').remove([doc.storage_path])
                        await supabase.from('documents').delete().eq('id', doc.id)
                        setDocs(ds => ds.filter(d => d.id !== doc.id))
                      }}>
                      <i className="ti ti-trash" style={{ fontSize: 15 }} />
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.docMeta}>
                <Avatar profile={doc.profiles || profile} size={18} />
                <span>{doc.profiles?.full_name || '…'} · {fmtDate(doc.created_at)} · {fmtSize(doc.size_bytes)}</span>
              </div>
              <button className={styles.commentToggle}
                onClick={() => setOpenComments(o => ({ ...o, [doc.id]: !o[doc.id] }))}>
                <i className="ti ti-message" />
                {(doc.comments || []).length > 0
                  ? `${doc.comments!.length} commentaire${doc.comments!.length > 1 ? 's' : ''}`
                  : 'Commenter'}
              </button>
              {openComments[doc.id] && (
                <CommentThread comments={doc.comments || []} currentProfile={profile}
                  onAdd={t => addComment(doc.id, t)} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
