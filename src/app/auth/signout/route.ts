import { type NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

// Logout via POST (botão "Sair" na sidebar). GET não desloga (anti-CSRF trivial).
export async function POST(request: NextRequest) {
  const supabase = await getServerClient()
  await supabase.auth.signOut()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url, { status: 303 })
}
