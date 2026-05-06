'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types/user'

export function useCurrentUser() {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function fetchProfile() {
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        setUser(null)
        setLoading(false)
        return
      }

      const { data } = await supabase.rpc('get_my_profile')

      if (data && data.length > 0) {
        const row = data[0]
        setUser({
          id:            row.id,
          email:         row.email,
          nome:          row.nome,
          role:          row.role as User['role'],
          setor_id:      row.setor_id,
          ativo:         row.ativo,
          ultimo_acesso: row.ultimo_acesso,
        })
      } else {
        setUser(null)
      }

      setLoading(false)
    }

    fetchProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchProfile()
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
