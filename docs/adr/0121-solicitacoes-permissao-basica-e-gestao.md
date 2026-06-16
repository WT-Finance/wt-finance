# ADR-0121 — Solicitações: permissão em dois níveis (básica + gestão)

**Status:** Aceito (v4.20.0, 2026-06-15)
**Relacionado:** ADR-0107 (catálogo de áreas), ADR-0112 (módulo de Solicitações), ADR-0117 (eixo por contexto). Migration 0143.
**Escopo:** RBAC de Solicitações. Migration **aditiva**.

## Contexto

Até a v4.19.x havia **uma** área de Solicitações, `solicitacoes`, rotulada *"Solicitações (gestão)"*, que liberava as capacidades de gestão (Ver todas, Gerenciar tipos, Movimentações + `/admin/solicitacoes/*`). A página `/solicitacoes` em si (caixa de entrada + minhas solicitações + abrir pedido) era **aberta a qualquer autenticado** (`requireArea(null)`).

Pedido (Yan, "antes do merge" da v4.20.0): separar em **duas permissões** — uma **básica** ("Solicitações") que dá acesso a caixa de entrada + minhas, e uma de **gestão** ("Solicitações (gestão)") que dá, além disso, os botões âmbar (Ver todas, Gerenciar, Movimentações).

## Decisão

**Manter `solicitacoes` como a área de GESTÃO (nome e guards inalterados) e adicionar `solicitacoes/basico` como a área BÁSICA.**

- **`solicitacoes`** (existente) → rótulo *"Solicitações (gestão)"*, grupo Administração. **Nenhum guard mudou:** `podeGestao = includes('solicitacoes')`, `requireArea('solicitacoes')` nas rotas `/admin/solicitacoes/*`, `exigir_acesso(['solicitacoes'])` nas RPCs de gestão, `tem_area('solicitacoes')` em `pode_ver_solic`/supervisão — tudo segue significando gestão.
- **`solicitacoes/basico`** (nova) → rótulo *"Solicitações"*, grupo Geral, ordem 45.
- **A gestão inclui a básica** ("dá acesso além desses"): a página `/solicitacoes` exige `['solicitacoes/basico','solicitacoes']` (OR — `requireArea` já suporta array). O item da sidebar idem (campo novo `areasAny`).

### Por que `solicitacoes` continua sendo a gestão (e não a básica)

A alternativa intuitiva (`solicitacoes` = básica, nova `solicitacoes/gestao` = gestão) **forçaria reescrever ~10 funções SECURITY DEFINER** (todos os guards `exigir_acesso(['solicitacoes'])` e `tem_area('solicitacoes')`) só para trocar a string da área — alto risco na camada de segurança, incluindo funções grandes (`criar_solicitacao` com a lógica de regra-de-data da 0140). Manter `solicitacoes` = gestão deixa **todos os guards de gestão intactos** (zero risco) e torna a migration **puramente aditiva**. O nome interno da área é opaco ao usuário; o que ele vê são os **rótulos** ("Solicitações" / "Solicitações (gestão)"), que ficam exatamente como pedido. O sufixo `/basico` na área nova é só convenção hierárquica (como `performance/weddings`).

### Backfill não-quebra (decisão de produto: conceder a todos)

Como `/solicitacoes` era aberto a todos, gatear a básica poderia trancar usuários no deploy. Decisão do Yan: a migration **concede `solicitacoes/basico` a TODOS os roles** (backfill), tornando o cutover não-quebra; o admin remove depois de quem não deve ter. Os gestores atuais mantêm `solicitacoes` (gestão) **e** ganham a básica pelo backfill — nada a migrar do lado de gestão.

### Enforcement e a fronteira aceita

- **Página (camada 2):** `requireArea(['solicitacoes/basico','solicitacoes'])` — é o **portão da feature** (sem a permissão → `/sem-acesso`; item some da sidebar).
- **Gestão (camadas 3/4):** intacta — RPCs e rotas de gestão exigem `solicitacoes`. Granting básico a todos **não** vaza gestão (verificado: grants de `solicitacoes` permanecem em 1 role).
- **RPCs básicas (getMinhas/getCaixa próprio/getPendencias/criar…) permanecem em `exigir_acesso()` (login+ativo).** Os dados que retornam são **self-scoped** (do próprio chamador); não há vazamento cross-user. A área básica é um gate de **navegação/feature** na página. É **estritamente não-pior que hoje** (hoje página e RPC são ambas any-auth). **Fronteira aceita e registrada:** negação hard no nível da RPC básica (recriar as ~7 funções para exigir a área) é follow-up se a diretoria quiser bloquear até o acesso por API direta — não feito agora para não arriscar funções grandes em produção por um ganho marginal.

## Consequências

- **Positivas:** acesso a Solicitações vira permissão concedível/revogável por role, sem reescrever a camada de gestão; cutover não-quebra; migration aditiva (gate como rede, sem confirmação humana).
- **Atenção:** o nome interno `solicitacoes` = gestão é contraintuitivo (documentado em `areas.ts` e aqui). A negação da feature para um usuário sem a básica é via página/sidebar; a API self-scoped permanece acessível a qualquer autenticado (fronteira aceita acima).
- **Sem mudança de contrato de RPC:** nenhuma função alterada; só catálogo (`rbac_areas`) + grants (`rbac_role_permissoes`). O teste de paridade `AREAS ↔ rbac_areas` cobre a área nova.
