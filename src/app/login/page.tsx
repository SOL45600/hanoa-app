'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(`Email ou mot de passe incorrect. (${data.error})`)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('Entrez votre adresse e-mail ci-dessus, puis cliquez sur "Mot de passe oublié".')
      return
    }
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    if (error) {
      setError('Erreur lors de l\'envoi. Réessayez dans 1 heure (limite Supabase).')
    } else {
      setError('')
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
            <h1>HANOA</h1>
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
          <p className={styles.hint}>
            <button type="button" className={styles.linkBtn} onClick={handleResetPassword}>
              Mot de passe oublié ?
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
