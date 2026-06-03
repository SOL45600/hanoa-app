'use client'
import { useEffect, useState } from 'react'
import { Profile } from '@/lib/types'
import styles from './FinanceView.module.css'

interface DashboardData {
  monthly_ca: number
  total_clients: number
  unpaid_count: number
  unpaid_amount: number
  recent_invoices: {
    id: number; number: string; date: string
    total_ht: number; remaining: number; paid: boolean
  }[]
}

function fmtEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) }

export default function FinanceView({ profile }: { profile: Profile }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile.role !== 'admin') return
    fetch('/api/sellsy?type=dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Impossible de contacter Sellsy'); setLoading(false) })
  }, [])

  if (profile.role !== 'admin') {
    return (
      <div className={styles.restricted}>
        <i className="ti ti-lock" style={{ fontSize: 40, color: '#d3d1c7' }} />
        <p>Accès réservé aux administrateurs</p>
      </div>
    )
  }

  if (loading) return <div className={styles.loading}><i className="ti ti-loader" /> Chargement Sellsy…</div>
  if (error) return <div className={styles.loading} style={{ color: '#d85a30' }}><i className="ti ti-alert-circle" /> {error}</div>
  if (!data) return null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Finance — Sellsy</h2>
          <p>Compte HANOA · Données en temps réel</p>
        </div>
        <a href="https://go.sellsy.com" target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
          <i className="ti ti-external-link" /> Ouvrir Sellsy
        </a>
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <i className="ti ti-trending-up" style={{ color: '#0f6e56' }} />
          <span className={styles.kpiValue}>{fmtEur(data.monthly_ca)}</span>
          <span className={styles.kpiLabel}>CA ce mois (HT)</span>
        </div>
        <div className={styles.kpi}>
          <i className="ti ti-building" style={{ color: '#185fa5' }} />
          <span className={styles.kpiValue}>{data.total_clients}</span>
          <span className={styles.kpiLabel}>Clients</span>
        </div>
        <div className={styles.kpi} style={{ borderColor: data.unpaid_count > 0 ? '#d85a3044' : undefined }}>
          <i className="ti ti-clock-dollar" style={{ color: data.unpaid_count > 0 ? '#d85a30' : '#888' }} />
          <span className={styles.kpiValue} style={{ color: data.unpaid_count > 0 ? '#d85a30' : undefined }}>
            {fmtEur(data.unpaid_amount)}
          </span>
          <span className={styles.kpiLabel}>{data.unpaid_count} facture{data.unpaid_count > 1 ? 's' : ''} impayée{data.unpaid_count > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Recent invoices */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Dernières factures</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>N° Facture</th>
                <th>Date</th>
                <th>Montant HT</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_invoices.map(inv => (
                <tr key={inv.id}>
                  <td className={styles.tdNum}>{inv.number}</td>
                  <td>{fmtDate(inv.date)}</td>
                  <td>{fmtEur(inv.total_ht)}</td>
                  <td>
                    <span className={inv.paid ? styles.paid : styles.unpaid}>
                      {inv.paid ? '✓ Payée' : `${fmtEur(inv.remaining)} dû`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup section */}
      <div className={styles.backupSection}>
        <div className={styles.backupHeader}>
          <i className="ti ti-database-export" style={{ color: '#185fa5', fontSize: 20 }} />
          <div>
            <div className={styles.backupTitle}>Sauvegarde des données</div>
            <div className={styles.backupSub}>Exporte toute la base de données en JSON (messages, commandes, tâches…)</div>
          </div>
        </div>
        <button className={styles.backupBtn} onClick={async () => {
          const res = await fetch('/api/backup', {
            headers: { 'x-backup-key': '' } // Will 401, needs key
          })
          if (res.status === 401) {
            // Download via direct URL with key from prompt
            const key = prompt('Clé de sauvegarde (CRON_SECRET_ALERT_WEENAT dans Vercel) :')
            if (!key) return
            const r = await fetch('/api/backup', { headers: { 'x-backup-key': key } })
            if (!r.ok) { alert('Clé incorrecte'); return }
            const blob = await r.blob()
            const date = new Date().toISOString().slice(0, 10)
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `backup-projet-sol-${date}.json`
            a.click()
          }
        }}>
          <i className="ti ti-download" /> Télécharger la sauvegarde JSON
        </button>
      </div>

      <p className={styles.note}>
        <i className="ti ti-shield-lock" /> Données visibles uniquement par les administrateurs
      </p>
    </div>
  )
}
