'use client'
import { useEffect, useRef } from 'react'
import styles from './Lots.module.css'

export default function QRCodeDisplay({ lotNumber, size = 120 }: { lotNumber: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    import('qrcode').then(QRCode => {
      const url = `${window.location.origin}/t/${encodeURIComponent(lotNumber)}`
      QRCode.toCanvas(canvasRef.current!, url, { width: size, margin: 1 })
    })
  }, [lotNumber, size])

  const download = async () => {
    const QRCode = await import('qrcode')
    const url = `${window.location.origin}/t/${encodeURIComponent(lotNumber)}`
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `qr-${lotNumber}.png`
    a.click()
  }

  const openPage = () => {
    window.open(`/t/${encodeURIComponent(lotNumber)}`, '_blank')
  }

  return (
    <div className={styles.qrContainer}>
      <canvas ref={canvasRef} className={styles.qrCanvas} />
      <div className={styles.qrActions}>
        <button className={styles.qrBtn} onClick={download} title="Télécharger QR code">
          <i className="ti ti-download" style={{ fontSize: 12 }} /> PNG
        </button>
        <button className={styles.qrBtn} onClick={openPage} title="Voir la page publique">
          <i className="ti ti-external-link" style={{ fontSize: 12 }} /> Page
        </button>
      </div>
    </div>
  )
}
