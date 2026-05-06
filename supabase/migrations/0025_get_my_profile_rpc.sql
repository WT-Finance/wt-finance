-- V4-2: RPC pública para leitura do perfil do usuário logado.
--
-- Necessário porque PostgREST só expõe o schema public; app.usuarios
-- não é acessível via supabase.from('...') do cliente.
-- SECURITY DEFINER: roda como postgres para contornar o RLS de app.usuarios.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id            uuid,
  email         text,
  nome          text,
  role          text,
  setor_id      bigint,
  ativo         boolean,
  ultimo_acesso timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id, email, nome, role, setor_id, ativo, ultimo_acesso
  FROM app.usuarios
  WHERE id = auth.uid()
  AND ativo = true
  LIMIT 1;
$$;
