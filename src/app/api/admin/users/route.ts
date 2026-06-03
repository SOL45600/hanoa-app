import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

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

// GET — list all users with their profiles
export async function GET() {
  const supabase = makeSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

  return NextResponse.json(profiles || [])
}

// POST — invite a new user (admin only)
export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Check if current user is admin
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (myProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
  }

  const { email, full_name, initials, color, role } = await req.json()

  // Use admin API to create user
  const adminRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: Math.random().toString(36).slice(2) + 'Aa1!',
        email_confirm: true,
        user_metadata: { full_name, initials, color },
      }),
    }
  )

  if (!adminRes.ok) {
    const err = await adminRes.json()
    return NextResponse.json({ error: err.message || 'Erreur création utilisateur' }, { status: 400 })
  }

  const newUser = await adminRes.json()

  // Update profile with role
  await supabase.from('profiles').upsert({
    id: newUser.id,
    full_name,
    initials: initials || full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
    color: color || '#0f6e56',
    role: role || 'member',
  })

  return NextResponse.json({ success: true, id: newUser.id })
}

// PATCH — update user role
export async function PATCH(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id, role, full_name, initials, color } = await req.json()

  const update: Record<string, string> = {}
  if (role) update.role = role
  if (full_name) update.full_name = full_name
  if (initials) update.initials = initials
  if (color) update.color = color

  const { error } = await supabase.from('profiles').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
