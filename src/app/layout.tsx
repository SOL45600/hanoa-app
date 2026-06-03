import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Projet SOL — Plateforme interne',
  description: 'Plateforme de partage de documents et de communication pour SOL',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Projet SOL',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f6e56',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // allows content under iOS notch/status bar
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Splash screen iOS — fond vert avec logo */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media (display-mode: standalone) {
            body::before {
              content: '';
              position: fixed;
              inset: 0;
              background: #0f6e56 url('/verger-login.jpg') center/cover;
              z-index: -1;
            }
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}
