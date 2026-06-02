'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Login] handleLogin called, email:', email)
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      console.log('[Login] calling signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.log('[Login] result:', JSON.stringify({ error: error?.message, user: data?.user?.email }))
      if (error) {
        setError(`Erreur (${error.status}): ${error.message}`)
        setLoading(false)
      } else {
        setSuccess('Connecté ! Redirection...')
        setTimeout(() => { window.location.replace('/') }, 1500)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Login] exception:', msg)
      setError(`Erreur inattendue: ${msg}`)
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('Entrez votre adresse e-mail ci-dessus, puis cliquez sur "Mot de passe oublié".')
      return
    }
    setError('')
    setSuccess('')
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setError('Erreur lors de l\'envoi. Vérifiez votre adresse e-mail.')
    } else {
      setSuccess('Email de réinitialisation envoyé ! Vérifiez votre boîte mail.')
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
          {success && <p className={styles.success}><i className="ti ti-circle-check" /> {success}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Connexion…' : 'Accéder à la plateforme'}
          </button>
          <p className={styles.hint}>
            <button type="button" className={styles.linkBtn} onClick={handleResetPassword} disabled={resetLoading}>
              {resetLoading ? 'Envoi en cours…' : 'Mot de passe oublié ?'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
