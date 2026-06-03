'use client'
import { useEffect, useState } from 'react'
import { Profile } from '@/lib/types'
import styles from './UsersView.module.css'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  member: 'Membre',
  readonly: 'Lecture seule',
}
const ROLE_COLORS: Record<string, string> = {
  admin: '#0f6e56',
  member: '#185fa5',
  readonly: '#888',
}
const COLORS = ['#0f6e56', '#185fa5', '#ba7517', '#d85a30', '#6b4fbb', '#d6538f']

export default function UsersView({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [form, setForm] = useState({
    email: '', full_name: '', initials: '', color: COLORS[0], role: 'member'
  })

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg('Utilisateur créé. Un email de connexion sera envoyé.')
      setShowAdd(false)
      setForm({ email: '', full_name: '', initials: '', color: COLORS[0], role: 'member' })
      // Reload
      const r = await fetch('/api/admin/users')
      const d = await r.json()
      setUsers(Array.isArray(d) ? d : [])
    } else {
      setMsg(`Erreur : ${data.error}`)
    }
    setSaving(false)
  }

  const handleRoleChange = async (userId: string, role: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, role }),
    })
    setUsers(u => u.map(usr => usr.id === userId ? { ...usr, role: role as Profile['role'] } : usr))
  }

  function Avatar({ profile }: { profile: Profile }) {
    return (
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: (profile.color || '#0f6e56') + '22',
        border: `1.5px solid ${(profile.color || '#0f6e56')}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, color: profile.color || '#0f6e56', flexShrink: 0,
      }}>{profile.initials}</div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Gestion des utilisateurs</h2>
          <p>{users.length} utilisateur{users.length > 1 ? 's' : ''}</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
          <i className="ti ti-user-plus" /> Inviter un utilisateur
        </button>
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      {/* Add user form */}
      {showAdd && (
        <form className={styles.addForm} onSubmit={handleAdd}>
          <h3>Nouvel utilisateur</h3>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Email *</label>
              <input type="email" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="prenom@exemple.fr" />
            </div>
            <div className={styles.field}>
              <label>Nom complet *</label>
              <input type="text" required value={form.full_name}
                onChange={e => {
                  const name = e.target.value
                  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                  setForm(f => ({ ...f, full_name: name, initials }))
                }}
                placeholder="Prénom Nom" />
            </div>
            <div className={styles.field}>
              <label>Initiales</label>
              <input type="text" maxLength={2} value={form.initials}
                onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase() }))}
                placeholder="PN" />
            </div>
            <div className={styles.field}>
              <label>Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="member">Membre</option>
                <option value="readonly">Lecture seule</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Couleur</label>
              <div className={styles.colorRow}>
                {COLORS.map(c => (
                  <button key={c} type="button"
                    className={`${styles.colorDot} ${form.color === c ? styles.colorDotActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))} />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" onClick={() => setShowAdd(false)} className={styles.cancelBtn}>Annuler</button>
            <button type="submit" disabled={saving} className={styles.saveBtn}>
              {saving ? 'Création…' : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.loading}><i className="ti ti-loader" /> Chargement…</div>
      ) : (
        <div className={styles.list}>
          {users.map(u => (
            <div key={u.id} className={styles.userRow}>
              <Avatar profile={u} />
              <div className={styles.userInfo}>
                <div className={styles.userName}>
                  {u.full_name}
                  {u.id === currentUserId && <span className={styles.you}>vous</span>}
                </div>
              </div>
              <div className={styles.roleCell}>
                {u.id === currentUserId ? (
                  <span className={styles.roleBadge} style={{ color: ROLE_COLORS[u.role || 'member'], background: ROLE_COLORS[u.role || 'member'] + '18' }}>
                    {ROLE_LABELS[u.role || 'member']}
                  </span>
                ) : (
                  <select
                    className={styles.roleSelect}
                    value={u.role || 'member'}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                  >
                    <option value="admin">Administrateur</option>
                    <option value="member">Membre</option>
                    <option value="readonly">Lecture seule</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.rolesInfo}>
        <p className={styles.rolesTitle}><i className="ti ti-info-circle" /> Rôles</p>
        <p><strong>Administrateur</strong> — accès complet, gestion des utilisateurs</p>
        <p><strong>Membre</strong> — lecture + écriture (posts, documents)</p>
        <p><strong>Lecture seule</strong> — consultation uniquement</p>
      </div>
    </div>
  )
}
