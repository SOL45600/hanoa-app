'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { User } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import { Section } from '@/lib/types'

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login'
        return
      }
      setUser(session.user as User)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      const { data: s } = await supabase.from('sections').select('*').order('sort_order')
      setProfile(p)
      setSections(s || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#666' }}>Chargement…</div>
  if (!user || !profile) return null

  return <AppShell user={user} profile={profile} initialSections={sections} />
}
