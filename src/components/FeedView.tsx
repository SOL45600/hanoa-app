'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Post, Comment, Profile } from '@/lib/types'
import Avatar from './Avatar'
import DocPreview from './DocPreview'
import styles from './FeedView.module.css'

interface Attachment {
  id: string; post_id: string; name: string
  storage_path: string; mime_type?: string; size_bytes?: number
}
interface PostWithAttachments extends Post {
  attachments?: Attachment[]; pinned?: boolean
}
interface Props {
  sectionId: string; userId: string; profile: Profile; supabase: SupabaseClient
}

const FILE_ICONS: Record<string, string> = {
  pdf: 'ti-file-type-pdf', doc: 'ti-file-type-doc', docx: 'ti-file-type-doc',
  xls: 'ti-file-spreadsheet', xlsx: 'ti-file-spreadsheet',
  jpg: 'ti-photo', jpeg: 'ti-photo', png: 'ti-photo', gif: 'ti-photo',
}
const FILE_COLORS: Record<string, string> = {
  pdf: '#d85a30', doc: '#185fa5', docx: '#185fa5',
  xls: '#1d9e75', xlsx: '#1d9e75',
  jpg: '#0f6e56', jpeg: '#0f6e56', png: '#0f6e56', gif: '#0f6e56',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtSize(b: number) {
  return b < 1048576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1048576).toFixed(1)} Mo`
}
function getExt(name: string) { return name.split('.').pop()?.toLowerCase() || '' }

function renderText(text: string) {
  const parts = text.split(/(@\w[\w.-]*)/g)
  return parts.map((p, i) =>
    p.startsWith('@') ? <span key={i} className={styles.mention}>{p}</span> : <span key={i}>{p}</span>
  )
}

/* ─── MENTION AUTOCOMPLETE ────────────────────────────────────── */
function MentionAutocomplete({ query, users, onSelect }: {
  query: string; users: Profile[]; onSelect: (name: string) => void
}) {
  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(query.toLowerCase())
  )
  if (filtered.length === 0) return null
  return (
    <div className={styles.mentionDropdown}>
      {filtered.map(u => (
        <button key={u.id} className={styles.mentionOption} onMouseDown={e => { e.preventDefault(); onSelect(u.full_name.split(' ')[0]) }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: (u.color || '#0f6e56') + '22',
            border: `1.5px solid ${(u.color || '#0f6e56')}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: u.color || '#0f6e56', flexShrink: 0,
          }}>{u.initials}</div>
          <span>{u.full_name}</span>
        </button>
      ))}
    </div>
  )
}

/* ─── COMMENT THREAD ──────────────────────────────────────────── */
function CommentThread({ comments, currentProfile, onAdd, onDelete }: {
  comments: Comment[]; currentProfile: Profile
  onAdd: (text: string) => void; onDelete: (commentId: string) => void
}) {
  const [text, setText] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d) })
  }, [])

  const handleInput = (val: string) => {
    setText(val)
    const m = val.match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  const insertMention = (name: string) => {
    const newText = text.replace(/@(\w*)$/, `@${name} `)
    setText(newText)
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  const submit = () => { if (text.trim()) { onAdd(text); setText('') } }

  return (
    <div className={styles.thread}>
      {comments.map(c => (
        <div key={c.id} className={styles.comment}>
          <Avatar profile={c.profiles || currentProfile} size={24} />
          <div className={styles.commentBubble}>
            <span className={styles.commentAuthor}>{c.profiles?.full_name || '…'}</span>
            <span className={styles.commentDate}>{fmtDate(c.created_at)}</span>
            <p>{renderText(c.content)}</p>
          </div>
          {c.author_id === currentProfile.id && (
            <button className={styles.deleteComment} onClick={() => onDelete(c.id)} title="Supprimer">
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          )}
        </div>
      ))}
      <div className={styles.commentInputWrap}>
        <Avatar profile={currentProfile} size={24} />
        <div className={styles.commentInputInner}>
          {mentionQuery !== null && (
            <MentionAutocomplete query={mentionQuery} users={users.filter(u => u.id !== currentProfile.id)} onSelect={insertMention} />
          )}
          <div className={styles.commentInput}>
            <input
              ref={inputRef}
              value={text}
              onChange={e => handleInput(e.target.value)}
              placeholder="Répondre… (@prénom pour mentionner)"
              onKeyDown={e => { if (e.key === 'Enter' && !mentionQuery) submit() }}
            />
            <button onClick={submit}>↵</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN FEED ───────────────────────────────────────────────── */
export default function FeedView({ sectionId, userId, profile, supabase }: Props) {
  const [posts, setPosts] = useState<PostWithAttachments[]>([])
  const [text, setText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d) })
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase.from('posts').select('*')
      .eq('section_id', sectionId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(async ({ data: postsData }) => {
        if (!postsData) { setLoading(false); return }
        const { data: attData } = await supabase.from('post_attachments').select('*')
          .in('post_id', postsData.map(p => p.id))
        const attMap: Record<string, Attachment[]> = {}
        attData?.forEach((a: Attachment) => {
          if (!attMap[a.post_id]) attMap[a.post_id] = []
          attMap[a.post_id].push(a)
        })
        setPosts(postsData.map(p => ({ ...p, attachments: attMap[p.id] || [] })))
        setLoading(false)
      })
  }, [sectionId])

  const handleTextChange = (val: string) => {
    setText(val)
    const m = val.match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  const insertMention = (name: string) => {
    const newText = text.replace(/@(\w*)$/, `@${name} `)
    setText(newText)
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  const submitPost = async () => {
    if (!text.trim() && pendingFiles.length === 0) return
    setSubmitting(true)

    const { data: post, error } = await supabase
      .from('posts').insert({ section_id: sectionId, author_id: userId, content: text })
      .select('*').single()
    if (error || !post) { setSubmitting(false); return }

    // Upload attachments
    const attachments: Attachment[] = []
    for (const file of pendingFiles) {
      const path = `${userId}/${sectionId}/posts/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('hanoa-files').upload(path, file)
      if (!upErr) {
        const { data: att } = await supabase.from('post_attachments')
          .insert({ post_id: post.id, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size })
          .select('*').single()
        if (att) attachments.push(att)
      }
    }

    // Notify mentioned users
    const mentions = Array.from(new Set(text.match(/@(\w+)/g)?.map(m => m.slice(1)) || []))
    if (mentions.length > 0) {
      fetch('/api/notify/mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentions, author: profile.full_name, content: text, sectionId }),
      }).catch(() => {})
    }

    setPosts(p => [{ ...post, attachments, profiles: profile }, ...p])
    setText('')
    setPendingFiles([])
    setMentionQuery(null)
    setSubmitting(false)
  }

  const togglePin = async (postId: string, currentPinned: boolean) => {
    await supabase.from('posts').update({ pinned: !currentPinned }).eq('id', postId)
    setPosts(ps => {
      const updated = ps.map(p => p.id === postId ? { ...p, pinned: !currentPinned } : p)
      return [...updated].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    })
  }

  const addComment = async (postId: string, content: string) => {
    const { data, error } = await supabase.from('comments')
      .insert({ post_id: postId, author_id: userId, content })
      .select('*').single()
    if (!error && data) {
      setPosts(ps => ps.map(p => p.id === postId
        ? { ...p, comments: [...(p.comments || []), { ...data, profiles: profile }] }
        : p))
      // Notify mentions in comment
      const mentions = Array.from(new Set(content.match(/@(\w+)/g)?.map(m => m.slice(1)) || []))
      if (mentions.length > 0) {
        fetch('/api/notify/mention', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mentions, author: profile.full_name, content, sectionId }),
        }).catch(() => {})
      }
    }
  }

  const deleteComment = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId)
    setPosts(ps => ps.map(p => ({
      ...p,
      comments: (p.comments || []).filter(c => c.id !== commentId)
    })))
  }

  const removeFile = (idx: number) => setPendingFiles(f => f.filter((_, i) => i !== idx))
  const getDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from('hanoa-files').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className={styles.feed}>
      {preview && (
        <DocPreview storagePath={preview.storage_path} fileName={preview.name}
          mimeType={preview.mime_type} supabase={supabase} onClose={() => setPreview(null)} />
      )}

      {/* Compose */}
      <div className={styles.compose}>
        <Avatar profile={profile} size={34} />
        <div className={styles.composeRight}>
          <div className={styles.textareaWrap}>
            {mentionQuery !== null && (
              <MentionAutocomplete
                query={mentionQuery}
                users={users.filter(u => u.id !== userId)}
                onSelect={insertMention}
              />
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => handleTextChange(e.target.value)}
              placeholder="Écrire un message… (tapez @ pour mentionner un collègue)"
              rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !mentionQuery) submitPost() }}
            />
          </div>

          {pendingFiles.length > 0 && (
            <div className={styles.pendingFiles}>
              {pendingFiles.map((f, i) => {
                const ext = getExt(f.name)
                return (
                  <div key={i} className={styles.pendingFile}>
                    <i className={`ti ${FILE_ICONS[ext] || 'ti-file'}`}
                      style={{ color: FILE_COLORS[ext] || '#888', fontSize: 16 }} />
                    <span>{f.name}</span>
                    <span className={styles.pendingSize}>{fmtSize(f.size)}</span>
                    <button onClick={() => removeFile(i)} className={styles.removeFile}>✕</button>
                  </div>
                )
              })}
            </div>
          )}

          <div className={styles.composeFooter}>
            <button className={styles.attachBtn} onClick={() => fileRef.current?.click()}>
              <i className="ti ti-paperclip" style={{ fontSize: 16 }} /> Joindre
            </button>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              onChange={e => setPendingFiles(f => [...f, ...Array.from(e.target.files || [])])} />
            <span className={styles.hint}>Cmd+Entrée</span>
            <button onClick={submitPost} className={styles.publishBtn}
              disabled={(!text.trim() && pendingFiles.length === 0) || submitting}>
              {submitting ? 'Envoi…' : 'Publier'}
            </button>
          </div>
        </div>
      </div>

      {loading && <p className={styles.empty}>Chargement…</p>}
      {!loading && posts.length === 0 && (
        <div className={styles.empty}>
          <i className="ti ti-messages" />
          <span>Aucun message dans cette rubrique</span>
        </div>
      )}

      {posts.map(post => (
        <div key={post.id} className={`${styles.post} ${post.pinned ? styles.pinned : ''}`}>
          {post.pinned && <div className={styles.pinnedBadge}><i className="ti ti-pin" /> Épinglé</div>}
          <Avatar profile={post.profiles || profile} size={34} />
          <div className={styles.postContent}>
            <div className={styles.postMeta}>
              <span className={styles.author}>{post.profiles?.full_name || profile.full_name}</span>
              <span className={styles.date}>{fmtDate(post.created_at)}</span>
              <button className={styles.pinBtn} onClick={() => togglePin(post.id, !!post.pinned)}
                title={post.pinned ? 'Désépingler' : 'Épingler'}>
                <i className={`ti ${post.pinned ? 'ti-pin-filled' : 'ti-pin'}`} />
              </button>
            </div>
            {post.content && <p className={styles.postText}>{renderText(post.content)}</p>}
            {post.attachments && post.attachments.length > 0 && (
              <div className={styles.attachments}>
                {post.attachments.map(a => {
                  const ext = getExt(a.name)
                  return (
                    <div key={a.id} className={styles.attachment}>
                      <i className={`ti ${FILE_ICONS[ext] || 'ti-file'}`}
                        style={{ color: FILE_COLORS[ext] || '#888', fontSize: 18 }} />
                      <button className={styles.attName} onClick={() => setPreview(a)}>{a.name}</button>
                      <span className={styles.attSize}>{a.size_bytes ? fmtSize(a.size_bytes) : ''}</span>
                      <button onClick={() => getDownloadUrl(a.storage_path)} className={styles.attAction} title="Télécharger">
                        <i className="ti ti-download" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <button className={styles.commentToggle}
              onClick={() => setOpenComments(o => ({ ...o, [post.id]: !o[post.id] }))}>
              <i className="ti ti-message" />
              {(post.comments || []).length > 0
                ? `${post.comments!.length} commentaire${post.comments!.length > 1 ? 's' : ''}`
                : 'Commenter'}
            </button>
            {openComments[post.id] && (
              <CommentThread
                comments={post.comments || []}
                currentProfile={profile}
                onAdd={t => addComment(post.id, t)}
                onDelete={deleteComment}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
