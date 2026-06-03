'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.hero}>
          <div className={styles.heroOverlay} />
          <div className={styles.heroContent}>
            <div className={styles.logoBox}>
              <i className="ti ti-leaf" />
            </div>
            <h1>Projet SOL</h1>
            <p>Plateforme interne</p>
          </div>
        </div>
        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label>Adresse e-mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="vous@exemple.fr" required autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label>Mot de passe</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
            />
          </div>
          {error && <p className={styles.error}><i className="ti ti-alert-circle" /> {error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Connexion…' : 'Accéder à la plateforme'}
          </button>
        </form>
      </div>
    </div>
  )
}
