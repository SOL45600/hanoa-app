import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  // Only allow admin requests (check via secret header)
  const auth = request.headers.get('x-backup-key')
  if (auth !== process.env.CRON_SECRET_ALERT_WEENAT) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const tables = ['sections', 'profiles', 'posts', 'comments', 'documents',
    'post_attachments', 'orders', 'order_lines', 'order_attachments', 'tasks',
    'section_reads', 'weenat_alerts_log']

  const backup: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    version: '1.0',
  }

  // Export all tables
  for (const table of tables) {
    try {
      const { data } = await admin.from(table).select('*')
      backup[table] = data || []
    } catch {
      backup[table] = []
    }
  }

  // List storage files
  const { data: storageFiles } = await admin.storage.from('hanoa-files').list('', {
    limit: 1000, sortBy: { column: 'created_at', order: 'desc' }
  })
  backup['storage_files'] = storageFiles || []
  backup['storage_note'] = 'Pour télécharger les fichiers : Supabase → Storage → hanoa-files → sélectionner tout → Download'

  const json = JSON.stringify(backup, null, 2)
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="backup-projet-sol-${date}.json"`,
    },
  })
}
