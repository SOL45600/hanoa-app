'use client'
import { useEffect, useState } from 'react'
import { Profile } from '@/lib/types'
import styles from './FinanceView.module.css'

interface DashboardData {
  monthly_ca: number
  yearly_ca: number
  yearly_year: string
  total_clients: number
  unpaid_count: number
  unpaid_amount: number
  unpaid_year_count: number
  unpaid_year_amount: number
  monthly_breakdown: Record<string, number>
  recent_invoices: { id: number; number: string; date: string; total_ht: number; remaining: number; paid: boolean }[]
  unpaid_invoices: { id: number; number: string; date: string; total_ht: number; remaining: number }[]
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
        <div className={styles.kpi} style={{ borderColor: '#0f6e5633' }}>
          <i className="ti ti-calendar-stats" style={{ color: '#0f6e56' }} />
          <span className={styles.kpiValue}>{fmtEur(data.yearly_ca)}</span>
          <span className={styles.kpiLabel}>CA {data.yearly_year} (HT)</span>
        </div>
        <div className={styles.kpi}>
          <i className="ti ti-building" style={{ color: '#185fa5' }} />
          <span className={styles.kpiValue}>{data.total_clients}</span>
          <span className={styles.kpiLabel}>Clients</span>
        </div>
        <div className={styles.kpi} style={{ borderColor: data.unpaid_year_count > 0 ? '#d85a3044' : undefined }}>
          <i className="ti ti-clock-dollar" style={{ color: data.unpaid_year_count > 0 ? '#d85a30' : '#888' }} />
          <span className={styles.kpiValue} style={{ color: data.unpaid_year_count > 0 ? '#d85a30' : undefined }}>
            {fmtEur(data.unpaid_year_amount)}
          </span>
          <span className={styles.kpiLabel}>{data.unpaid_year_count} impayée{data.unpaid_year_count > 1 ? 's' : ''} {data.yearly_year}</span>
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>CA mensuel {data.yearly_year} (HT)</p>
        <div className={styles.barChart}>
          {Object.entries(data.monthly_breakdown).map(([key, val]) => {
            const maxVal = Math.max(...Object.values(data.monthly_breakdown), 1)
            const pct = (val / maxVal) * 100
            const month = new Date(key + '-01').toLocaleDateString('fr-FR', { month: 'short' })
            const isCurrent = key === new Date().toISOString().slice(0, 7)
            return (
              <div key={key} className={styles.barCol}>
                <span className={styles.barVal}>{val > 0 ? fmtEur(val).replace(/\s€/, '') : ''}</span>
                <div className={styles.barWrap}>
                  <div className={styles.bar} style={{
                    height: `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                    background: isCurrent ? 'var(--green)' : val > 0 ? '#0f6e5666' : '#f0ede6'
                  }} />
                </div>
                <span className={`${styles.barLabel} ${isCurrent ? styles.barLabelCurrent : ''}`}>{month}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Unpaid invoices this year */}
      {data.unpaid_invoices.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Factures impayées {data.yearly_year}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>N° Facture</th><th>Date</th><th>Total HT</th><th>Restant dû</th></tr></thead>
              <tbody>
                {data.unpaid_invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className={styles.tdNum}>{inv.number}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>{fmtEur(inv.total_ht)}</td>
                    <td><span className={styles.unpaid}>{fmtEur(inv.remaining)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent invoices */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>15 dernières factures</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>N° Facture</th><th>Date</th><th>Montant HT</th><th>Statut</th></tr></thead>
            <tbody>
              {data.recent_invoices.map(inv => (
                <tr key={inv.id}>
                  <td className={styles.tdNum}>{inv.number}</td>
                  <td>{fmtDate(inv.date)}</td>
                  <td>{fmtEur(inv.total_ht)}</td>
                  <td><span className={inv.paid ? styles.paid : styles.unpaid}>
                    {inv.paid ? '✓ Payée' : `${fmtEur(inv.remaining)} dû`}
                  </span></td>
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
