import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Aceita SUPABASE_URL ou cai no NEXT_PUBLIC_SUPABASE_URL como fallback.
// Remove qualquer sufixo de caminho REST (/rest/v1/) se presente — o createClient
// espera apenas a URL base do projeto (https://xxx.supabase.co).
const rawUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!rawUrl || !serviceRoleKey) {
  throw new Error(
    'SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY são obrigatórios. ' +
    'Verifique o arquivo .env.local.'
  )
}

const supabaseUrl = rawUrl.replace(/\/(rest\/v1\/?)?$/, '')

export const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})
