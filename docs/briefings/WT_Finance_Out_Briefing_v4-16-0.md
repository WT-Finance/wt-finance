# WT Finance — Out-Briefing v4.16.0

**Data:** 2026-06-12 · **Branch:** `feat/v4-16-0-solicitacoes` · **Versão:** 4.15.0 → **4.16.0** (MINOR)
**Tema:** **Módulo de Solicitações** internas ao financeiro (regime autônomo; 1ª feature de produto no regime). ADRs 0112/0113. **Merge e deploy permanecem com o usuário.**

---

## Missões / commits
| Commit | Conteúdo |
|--------|----------|
| `m1` | **Fundação DB** — migrations 0127 (schema+RLS+área+bucket), 0128 (RPCs), 0129 (fix visibilidade NULL-safe). ADRs 0112/0113. |
| `m2` | **Contrato TS + Server Actions** — `areas.ts` (área `solicitacoes`), `solicitacoes/schemas` (Zod), `solicitacoes/rpc` (wrappers de leitura), actions (criar/concluir/rejeitar/cancelar + uploadAnexo/anexoUrl + admin tipos). |
| `m3` | **UI** — página `/solicitacoes` (Minhas + board + drawer + modal Nova com motor dinâmico), admin `/admin/solicitacoes`, **aba "Solicitações" na sidebar com badge**. Migration 0130 (flags de papel). Contratos no rpc-contrato.test. |
| `m4` | versão 4.16.0, CHANGELOG, CHANGELOG_DIRETORIA, runbook, este out-briefing, CLAUDE.md. |

## Migrations (aplicadas; backup pré-v4.16 com restore testado)
- **0127** schema (4 tabelas RLS-fechadas) + área `solicitacoes` + bucket privado `solicitacoes-anexos`.
- **0128** RPCs `SECURITY DEFINER` (helpers + abertura/validação dinâmica + transições + leitura/board + admin tipos + contagem + signed-path), grants explícitos.
- **0129** fix de visibilidade NULL-safe (achado da auto-auditoria — ver abaixo).
- **0130** `solic_json` expõe `sou_solicitante`/`sou_atendente` (afordância de UI).

## ADRs
- **0112** modelo de campos dinâmicos: definição viva (`solicitacao_campo`) + **snapshot JSONB imutável** das respostas na solicitação; validação server-side. Alternativas (tabela de valores normalizada, zod no client, EAV) rejeitadas.
- **0113** anexos: bucket privado + validação server-side + **signed URLs** (sem RLS de storage por dono na v1). Alternativas consideradas.

## Parâmetros de sucesso — resultado
1. **Ciclo de vida à prova de RPC direta:** ✅ legais funcionam; ilegais bloqueadas no banco (concluir já-concluída, cancelar como atendente, rejeitar como solicitante, rejeitar sem justificativa, agir como terceiro). Auditoria 25/25.
2. **Visibilidade no banco:** ✅ A não lê de B; `anon` negado em todas as RPCs (teste de contrato) e tabelas (RLS deny + REVOKE). Escopo `todas` exige área.
3. **Motor dinâmico:** ✅ tipo com os 7 campos; abertura válida grava e exibe; payload adulterado (obrigatório ausente, tipo errado, seleção inexistente, XOR) **rejeitado no servidor**.
4. **Anexos:** ✅ upload validado (MIME/tamanho) no servidor + bucket; download por signed URL que checa visibilidade (`solic_anexo_path`).
5. **Board:** ✅ colunas por tipo, ordenação por data-limite, vencida destacada, concluídas recolhidas, sub-filtro mim/role/gestão, círculo conclui, card abre drawer.
6. **Arquivamento:** ✅ tipo com vínculos não excluível (só arquiva, some da abertura, histórico íntegro); tipo virgem excluível.
7. **Badge:** ✅ contagem por usuário (próprias + via role) no `getPendencias` do layout; atualiza por navegação/ação.
8. **Tema:** ✅ telas neutras Group (tokens, pills `botoes.ts`, `.foco-neutro`); zero hex de setor nos arquivos novos.
9. **Contrato Zod:** ✅ schemas de leitura + 6 testes de contrato vivos (96 testes no total).
10. **Gates:** ✅ `tsc` 0 · `npm test` 96 (≥90) · `lint` 13 (baseline) · `build` limpo.
11. **Preview:** ⏳ ver seção Preview/Verificação.

## Auto-auditoria adversarial (§7) — EXECUTADA
Harness com 3 perfis (solicitante, atendente-por-role, terceiro) + anon, usuários descartáveis, **0 resíduo** em produção. **25/25 PASS** cobrindo as matrizes 1 e 2, validação dinâmica, XOR, arquivamento e data pura.
- **Achado crítico (corrigido na 0129):** `pode_ver_solic`/`sou_atendente` comparavam `destinatario_user_id = uid` — com destinatário ROLE (user_id NULL), a comparação dava NULL, e `false OR NULL` = NULL; `IF NOT NULL THEN RAISE` **não disparava** → um terceiro conseguia ver/concluir solicitação de role alheia. Fix: `coalesce(..., false)`. Re-auditoria 25/25.

## Preview / Verificação
- RPC-level: matrizes verificadas direto contra produção (25/25). Build das rotas novas limpo.
- Roteiro de demonstração manual no preview (click-through não automatizável aqui): (1) `/admin/solicitacoes` → criar um tipo com vários campos; (2) `/solicitacoes` → Nova solicitação (anexo incluso) → enviar; (3) Caixa de entrada (board) → abrir card → concluir/rejeitar; (4) cancelar uma própria em Minhas. Usuários de teste descartáveis; remover dados de teste ao fim.

## Decisões de produto registradas
- **Visão de gestão (§2.3 × §2.4):** confirmado com o Yan — gestão = **3º escopo "Todas (gestão)"** no sub-filtro do board, visível só para a área `solicitacoes` (não tela separada).

## Achados para a fila (não implementados — escopo)
- Click-through do preview não automatizável (sem browser) — verificação manual recomendada antes do merge.
- Remoção de anexo manual antes do envio deixa objeto tmp órfão no Storage (limpeza best-effort só na falha do criar). Limpador periódico de `tmp/` é candidato a fase 2.
- Fase 2 (fora do escopo, registrado): reabertura, comentários, reatribuição, notificação externa/Teams, edição de solicitação aberta.

## Arquivos (principais)
- **Banco:** `supabase/migrations/0127..0130`.
- **Contrato/lib:** `src/lib/auth/areas.ts`, `src/lib/solicitacoes/{schemas,rpc,format}.ts`.
- **Actions:** `src/app/solicitacoes/actions.ts`, `src/app/admin/solicitacoes/actions.ts`.
- **UI:** `src/components/solicitacoes/{campos-dinamicos,modal-nova-solicitacao,drawer-solicitacao,minhas-solicitacoes,board-solicitacoes,solicitacoes-content}.tsx`, `src/app/solicitacoes/page.tsx`, `src/components/admin/solicitacoes/{tipos-content,editor-tipo}.tsx`, `src/app/admin/solicitacoes/page.tsx`.
- **Sidebar/badge:** `src/components/layout/sidebar.tsx`, `src/app/layout.tsx`.
- **Docs/versão:** ADRs 0112/0113, runbook v4-16, CHANGELOG, CHANGELOG_DIRETORIA, package.json (4.16.0), CLAUDE.md.

---

**PR:** `feat/v4-16-0-solicitacoes` → main. Merge e deploy ficam com o usuário.
