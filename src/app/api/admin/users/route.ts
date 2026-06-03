import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Admin client uses secret key (server-side only, never exposed to browser)
function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Regular client for session check
function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(list: { name: string; value: string; options?: any }[]) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

// GET — list all profiles
export async function GET() {
  const admin = makeAdminClient()
  const { data, error } = await admin.from('profiles').select('*').order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data || [])
}

// POST — create a new user
export async function POST(req: NextRequest) {
  const admin = makeAdminClient()
  const { email, full_name, initials, color, role, password } = await req.json()

  if (!email || !full_name || !password) {
    return NextResponse.json({ error: 'Email, nom et mot de passe requis' }, { status: 400 })
  }

  // Create auth user
  const { data: userData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, initials, color },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = userData.user.id

  // Upsert profile
  await admin.from('profiles').upsert({
    id: userId,
    full_name,
    initials: initials || full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
    color: color || '#0f6e56',
    role: role || 'member',
  })

  return NextResponse.json({ success: true, id: userId })
}

// PATCH — update role
export async function PATCH(req: NextRequest) {
  const admin = makeAdminClient()
  const { id, role } = await req.json()
  const { error } = await admin.from('profiles').update({ role }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

// DELETE — remove user
export async function DELETE(req: NextRequest) {
  const admin = makeAdminClient()
  const { id } = await req.json()
  await admin.auth.admin.deleteUser(id)
  await admin.from('profiles').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
