# ADR-0175 — Separação entre credencial de verificação e credencial de aplicação

**Status:** aceito (v6.0.0) · **Data:** 2026-09-21 ·
**Contexto:** versão v6.0.0, "Fundação da ingestão" — Frente A (A1 `verificador`, A2 `ingestor`) ·
**Briefing:** `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md` §5 A e o anexo
`docs/briefings/anexo-v6-0-0-briefing-role-verificador.md` · **Migrations:** `0273` (verificador),
`0274` (ingestor) · **Runbook:** `docs/runbooks/credenciais-maquina-runbook.md`

> Numeração conferida contra `docs/adr/` e `supabase/migrations/` no remoto em 21/09/2026
> (últimos reais: ADR 0174, migration 0272).

## O problema

Em 10/09/2026 uma varredura de **verificação** ("quais RPCs devolvem 500 sem argumento?") rodou com
`SUPABASE_SERVICE_ROLE_KEY`, chamou funções de `TRUNCATE` e zerou 306.261 linhas em 10 tabelas de
produção. A lição foi para a skill `banco-e-rpc`, mas **não havia enforcement mecânico**: num banco
onde a RPC é a superfície de escrita, a credencial que verifica era a mesma que pode tudo, e a
única barreira era a disciplina de quem digitava.

O mesmo desenho servia a suíte de contrato (`rpc-contrato.test.ts`), o oráculo da DRE
(`scripts/dre-oracle.mjs`) e qualquer script de medição: todos com a chave de serviço, todos com
`exigir_acesso` em bypass (o ramo `role = service_role` retorna cedo).

## Decisão

**Uma credencial por papel, com o servidor negando — não a convenção.**

1. **`verificador`** (0273): role NOLOGIN do Postgres, concedida a `authenticator` para o
   PostgREST poder assumi-la. Nasce **sem EXECUTE** em função alguma (REVOKE explícito + `ALTER
   DEFAULT PRIVILEGES` para função futura não nascer aberta) e recebe EXECUTE só numa
   **allowlist por assinatura**, **derivada** do código que a usa (`scripts/credencial/
   derivar-allowlist.mjs` lê a suíte e os scripts de medição, resolve no catálogo vivo e emite
   o bloco `GRANT`). O JWT tem `role = verificador` e `sub` = um **usuário de máquina** ativo
   (`verificador@janus.interno`, role RBAC "Máquina · verificação" com todas as áreas fora do
   grupo Administração). `statement_timeout = 8s`, o mesmo da UI.
2. **`ingestor`** (0274): a mesma anatomia para a **escrita** da ingestão — allowlist = só as
   RPCs de staging e promoção das cinco bases; usuário `ingestor@janus.interno` com a área
   `admin/uploads` apenas; `statement_timeout = 0` (carga pesada); a porta HTTP autentica por
   `x-api-key` com **escopo por base** em `app.api_chave.escopo_bases`.
3. **`app.exigir_acesso` não muda.** Um JWT com `role` de máquina e `sub` de usuário real ativo
   percorre o caminho normal de usuário: exige `ativo` e área. São **duas camadas
   independentes** — ter o EXECUTE não basta (RBAC de área nega), ter a área não basta (sem
   EXECUTE o Postgres nega). A prova está no bloco "GATE 2" de `rpc-contrato.test.ts`:
   `truncar_*` ⇒ sem privilégio no catálogo **e** 4xx via REST; `admin_*` ⇒ `PERMISSAO_NEGADA`.
4. **`SUPABASE_SERVICE_ROLE_KEY` continua existindo** — o app precisa dela (cliente admin,
   Storage, Auth Admin) — mas só pode ser **lida** nos pontos declarados na sonda
   `src/lib/sonda-credencial.test.ts` (o cliente admin da aplicação, a exceção da API externa
   com fixture commitada, e o bootstrap do usuário de máquina). Verificação, medição e
   varredura usam `SUPABASE_VERIFICADOR_KEY` ou reprovam no gate, com o nome do arquivo.

## Por que allowlist derivada, e não volatilidade

`public` tem ~191 funções `VOLATILE` e entre elas há leitores puros (`get_cagr`,
`get_acumulado_weddings`): `VOLATILE` é o default de quem não declarou nada. "EXECUTE só nas
STABLE" quebraria a suíte e não diria nada sobre segurança. A allowlist é **o que a verificação
chama** — e por isso é mecânica: alguém acrescenta um caso de contrato, roda o script, o GRANT
sai numa migration aditiva. Escrita à mão, a lista envelhece em silêncio.

**Consequência desejada (fail-closed):** RPC nova nasce **fora** da allowlist. O caso de contrato
dela falha com `PERMISSAO_NEGADA` até alguém conceder o EXECUTE deliberadamente. Isso está na
mensagem do runbook para a próxima versão não achar que quebrou algo.

## O que a allowlist do `verificador` contém e por quê (21/09/2026: 54 assinaturas, só leitura)

- Leituras gated por área — a role RBAC de máquina tem as áreas de leitura.
- **Nenhuma RPC de escrita.** A primeira versão da allowlist trazia `dre_estrutura_salvar`,
  `dre_comp_estrutura_salvar` e `dre_estrutura_desfazer_*` porque a suíte as exercitava em
  modo no-op/recusa; o `revisor-db` apontou (ALTO) que **o GRANT não sabe disso** — um JWT
  vazado teria o mesmo poder de escrita estrutural que um usuário de `financeiro/dre`. A
  correção foi tirar essas RPCs do caminho REST: os casos passaram para
  `src/lib/dre/reverter-diario.test.ts`, em transação revertida com identidade JWT simulada
  (`set_config('request.jwt.claims', …)`, molde de `estante-rpcs.test.ts`). O corpo roda até
  o guard, o erro tem de ser o do guard, e nada persiste. A prova ficou; o privilégio, não.
- `validar_carga_staging`: só lê a staging. É a única da lista **sem** `exigir_acesso` (é
  service_role-only por grant, 0116) — assimetria registrada no header da 0273 (MÉDIO do
  revisor-db): aceita porque o corpo só lê; se ganhar escrita, sai.
- **Fora, de propósito:** `admin_listar_areas` e `admin_acesso_solicitacoes_pendentes` (área
  administrativa — viraram prova negativa no bloco "GATE 2"), todo `truncar_*`, `promover_*`,
  `limpar_staging_*`, `inserir_lote_*`, `truncate_dynamic_tables`.

## Consequências

- **Positivas.** A classe do incidente fecha no servidor. A suíte inteira roda com a credencial
  nova, contagem igual ou maior, 0 skip (invariante 7 do briefing). Duas alavancas de
  revogação independentes (desativar o usuário ⇒ `USUARIO_INATIVO` na hora; trocar o JWT), e
  uma terceira para o `ingestor` (revogar a `x-api-key` ⇒ 401).
- **Custos.** Dois usuários de máquina aparecem em `/admin/acessos` (deliberado: quem administra
  acessos vê que a máquina existe e o que ela alcança). Uma role RBAC a mais por credencial.
  Um passo humano na criação: o JWT é assinado com o **JWT secret do projeto**, que não vive no
  `.env.local` nem no repositório — `gerar-jwt.mjs` recebe-o só na linha de comando, no ato.
- **O que muda para o desenvolvedor.** RPC nova + caso de contrato = rodar `derivar-allowlist.mjs`
  e colar o GRANT numa migration aditiva. `SUPABASE_SERVICE_ROLE_KEY` em teste ou script de
  medição = reprovado pela sonda C1.
- **Limites.** A geração do JWT é manual e de validade longa (10 anos); rotação "de verdade"
  é desativar o usuário e criar outro `sub`. Role `pg` read-only separada para `SUPABASE_DB_URL`
  continua fora (a trava de sessão resolve por ora — v5.10.3). `STABLE` nos ~191 `VOLATILE`
  segue no backlog v6.

## Alternativas descartadas

- **Filtrar EXECUTE por `provolatile`** — ver acima; quebraria a suíte e não mede segurança.
- **Continuar com service_role + disciplina** — foi o que falhou em 10/09.
- **JWT de curta validade gerado sob demanda** — exigiria o JWT secret no ambiente do agente,
  que é justamente o que não se quer; fica para quando houver cofre de segredos.
- **Usuário de máquina INATIVO (como o robô da API externa)** — não serve: `exigir_acesso` exige
  `ativo`; o robô da API externa nunca chama RPC gated, o verificador chama 58.
