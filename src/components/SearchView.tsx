'use client'
import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Section } from '@/lib/types'
import styles from './SearchView.module.css'

interface Props {
  supabase: SupabaseClient
  sections: Section[]
  onNavigate: (sectionId: string, view: 'feed' | 'docs') => void
}

interface Result {
  type: 'post' | 'document'
  id: string
  title: string
  excerpt: string
  section_id: string
  sectionLabel: string
  date: string
}

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return <>{parts.map((p, i) =>
    regex.test(p) ? <mark key={i} className={styles.hl}>{p}</mark> : <span key={i}>{p}</span>
  )}</>
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SearchView({ supabase, sections, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  const sectionMap = new Map(sections.map(s => [s.id, s.label]))

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)

    const [{ data: posts }, { data: docs }] = await Promise.all([
      supabase.from('posts').select('id, content, section_id, created_at')
        .ilike('content', `%${q}%`).limit(20),
      supabase.from('documents').select('id, name, section_id, created_at')
        .ilike('name', `%${q}%`).limit(20),
    ])

    const postResults: Result[] = (posts || []).map(p => ({
      type: 'post' as const,
      id: p.id,
      title: p.content.split('\n')[0].slice(0, 80),
      excerpt: p.content.slice(0, 120),
      section_id: p.section_id,
      sectionLabel: sectionMap.get(p.section_id) || '…',
      date: p.created_at,
    }))

    const docResults: Result[] = (docs || []).map(d => ({
      type: 'document' as const,
      id: d.id,
      title: d.name,
      excerpt: '',
      section_id: d.section_id,
      sectionLabel: sectionMap.get(d.section_id) || '…',
      date: d.created_at,
    }))

    setResults([...postResults, ...docResults].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ))
    setLoading(false)
  }, [supabase, sections])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  return (
    <div className={styles.container}>
      <div className={styles.searchBar}>
        <i className="ti ti-search" style={{ fontSize: 18, color: '#888' }} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher dans les messages et documents…"
          className={styles.input}
        />
        {query && <button className={styles.clear} onClick={() => setQuery('')}>✕</button>}
      </div>

      {loading && <div className={styles.status}><i className="ti ti-loader" /> Recherche…</div>}

      {!loading && query && results.length === 0 && (
        <div className={styles.status}>Aucun résultat pour « {query} »</div>
      )}

      {!loading && !query && (
        <div className={styles.empty}>
          <i className="ti ti-search" style={{ fontSize: 32, color: '#d3d1c7' }} />
          <p>Tapez pour rechercher dans tous les messages et documents</p>
        </div>
      )}

      <div className={styles.results}>
        {results.map(r => (
          <button key={r.id} className={styles.result}
            onClick={() => onNavigate(r.section_id, r.type === 'post' ? 'feed' : 'docs')}>
            <div className={styles.resultIcon} style={{ background: r.type === 'post' ? '#e8f5ee' : '#e8f4fd' }}>
              <i className={`ti ${r.type === 'post' ? 'ti-message' : 'ti-file'}`}
                style={{ color: r.type === 'post' ? '#0f6e56' : '#185fa5', fontSize: 16 }} />
            </div>
            <div className={styles.resultBody}>
              <div className={styles.resultTitle}>{highlight(r.title, query)}</div>
              {r.excerpt && <div className={styles.resultExcerpt}>{highlight(r.excerpt, query)}</div>}
              <div className={styles.resultMeta}>
                <span className={styles.resultType}>{r.type === 'post' ? 'Message' : 'Document'}</span>
                <span>·</span>
                <span>{r.sectionLabel}</span>
                <span>·</span>
                <span>{fmtDate(r.date)}</span>
              </div>
            </div>
            <i className="ti ti-arrow-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
