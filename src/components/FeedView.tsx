'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Post, Comment, Profile } from '@/lib/types'
import Avatar from './Avatar'
import styles from './FeedView.module.css'

interface Props {
  sectionId: string
  userId: string
  profile: Profile
  supabase: SupabaseClient
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function CommentThread({ comments, currentProfile, onAdd }: { comments: Comment[]; currentProfile: Profile; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  const submit = () => { if (text.trim()) { onAdd(text); setText('') } }
  return (
    <div className={styles.thread}>
      {comments.map(c => (
        <div key={c.id} className={styles.comment}>
          <Avatar profile={c.profiles || currentProfile} size={24} />
          <div className={styles.commentBubble}>
            <span className={styles.commentAuthor}>{c.profiles?.full_name || '…'}</span>
            <span className={styles.commentDate}>{fmtDate(c.created_at)}</span>
            <p>{c.content}</p>
          </div>
        </div>
      ))}
      <div className={styles.commentInput}>
        <Avatar profile={currentProfile} size={24} />
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Répondre…"
          onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        <button onClick={submit}>↵</button>
      </div>
    </div>
  )
}

export default function FeedView({ sectionId, userId, profile, supabase }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    supabase
      .from('posts')
      .select('*, profiles(*), comments(*, profiles(*))')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPosts(data || []); setLoading(false) })
  }, [sectionId])

  const submitPost = async () => {
    if (!text.trim()) return
    const { data, error } = await supabase
      .from('posts')
      .insert({ section_id: sectionId, author_id: userId, content: text })
      .select('*, profiles(*), comments(*, profiles(*))')
      .single()
    if (!error && data) { setPosts(p => [data, ...p]); setText('') }
  }

  const addComment = async (postId: string, content: string) => {
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: userId, content })
      .select('*, profiles(*)')
      .single()
    if (!error && data) {
      setPosts(ps => ps.map(p => p.id === postId ? { ...p, comments: [...(p.comments || []), data] } : p))
    }
  }

  return (
    <div className={styles.feed}>
      <div className={styles.compose}>
        <Avatar profile={profile} size={34} />
        <div className={styles.composeRight}>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Écrire un message dans cette rubrique…"
            rows={3} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPost() }} />
          <div className={styles.composeFooter}>
            <span className={styles.hint}>Cmd+Entrée pour publier</span>
            <button onClick={submitPost} className={styles.publishBtn} disabled={!text.trim()}>
              Publier
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
        <div key={post.id} className={styles.post}>
          <Avatar profile={post.profiles || profile} size={34} />
          <div className={styles.postContent}>
            <div className={styles.postMeta}>
              <span className={styles.author}>{post.profiles?.full_name || '…'}</span>
              <span className={styles.date}>{fmtDate(post.created_at)}</span>
            </div>
            <p className={styles.postText}>{post.content}</p>
            <button className={styles.commentToggle}
              onClick={() => setOpenComments(o => ({ ...o, [post.id]: !o[post.id] }))}>
              <i className="ti ti-message" />
              {(post.comments || []).length > 0
                ? `${post.comments!.length} commentaire${post.comments!.length > 1 ? 's' : ''}`
                : 'Commenter'}
            </button>
            {openComments[post.id] && (
              <CommentThread comments={post.comments || []} currentProfile={profile}
                onAdd={t => addComment(post.id, t)} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
