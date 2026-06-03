import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Projet SOL — Plateforme interne',
  description: 'Plateforme de partage de documents et de communication pour SOL',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
