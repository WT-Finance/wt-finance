# ADR-0116 — Backup-gate como REDE de recuperação de migrations

**Status:** Aceito (ativado no merge deste PR)
**Data:** 2026-06-14
**Relacionado:** ADR-0111 (pipeline atômico), âncora de reversibilidade ratificada 2026-06-13 (CLAUDE.md)

## Contexto

O projeto não tem staging: `npx supabase db push --linked` aplica migrations direto em **produção**.
A rede contra migration ruim era a **confirmação humana** + um backup manual por versão, com restore-test
de **spot-check de uma tabela** (ex.: `dim_setor_macro` 3=3). Já existiam `exportar.mjs`/`restaurar.mjs`
(`~/wt-finance-backups/`). Faltava transformar isso num **gate automático e confiável**.

## Decisão

Construir um **backup-gate** rodado pelo wrapper único `npm run db:migrate` **antes** de todo push:
1. **Backup-do-dia** lógico (`scripts/db-gate/exportar.mjs`).
2. **Completude:** toda tabela viva de produção presente no manifest, com `count(*)` conferido + `.sql` em disco.
3. **Restore-test SPOT robusto:** restaura um **subconjunto-chave** (financeiras críticas + FK + coluna
   gerada + auth) num schema descartável e compara **produção × restaurado** (count + checksum por tabela).
   **NÃO** restaura as 38 tabelas.

Verde → a rede de recuperação está OK. Vermelho → exit ≠0, push **não acontece**.

**O gate é uma REDE, não autorização.** A política de migration **não muda**:
- **Aditiva/retrocompatível:** regime autônomo — `db:migrate --aditiva` aplica após o gate verde.
- **Destrutiva:** `db:migrate --destrutiva` roda o gate como rede **e MANTÉM a confirmação humana** antes
  do push (não auto-confirma). O gate **não** autoriza autonomia destrutiva.

## Escopo honesto (o que o gate garante e o que NÃO)

O gate garante **recuperação**, não **prevenção**. Uma migration destrutiva equivocada ainda destrói em
produção; o gate assegura que dá para **restaurar** ao estado pré-migration (no plano Free não há PITR —
o dump lógico é a única rede). É por isso que ele é rede e **não** substitui a confirmação: a confiança
para dispensar o humano só viria de um restore-test **completo** (todas as tabelas) — que é **follow-up**,
não este escopo.

## Correção que faz a confiança (não pode ser teatro)

- **Comparação PRODUÇÃO × RESTAURADO, nunca dump × restaurado** (circular). O gate lê produção viva a cada
  execução — provado: inserir uma linha em produção após o dump deixa o gate **vermelho** (não-circular).
- **Checksum de conteúdo por tabela** (md5 agregado), não só contagem.
- **Completude por manifest** — tabela viva ausente do backup → vermelho (falha rápido, sem restaurar).
- **Cleanup garantido** do schema descartável (try/finally + `DROP IF EXISTS` no início, idempotente após crash).
- **Guarda dura:** nenhum statement do restore pode inserir fora do schema descartável.

## Alternativas consideradas

- **Supabase branching (descartado):** branch efêmero nasce **sem dado de produção** — valida schema, não
  pega regressão por volume/FK/timeout; promoção no merge roda direto em prod; exige Pro + branches fora do
  Spend Cap. Protege o schema, não o dado.
- **Dry-run local (`supabase start`/`db diff`) — inviável:** depende de Docker, ausente no WSL2.
- **Spot-subconjunto vs completo:** o spot robusto (subconjunto-chave) é o núcleo (rede rápida o bastante
  para rodar antes de cada migration); o **completo** (todas as tabelas) é follow-up — mais lento, e seria a
  base para um dia dispensar a confirmação destrutiva.
- **Enforcement por wrapper vs git hook:** wrapper `npm run db:migrate` — explícito, versionado, revisável.

## Consequências

- `npm run db:migrate` é o caminho recomendado de push (roda a rede); `db push` cru pula a rede — evitar.
- **Destrutiva mantém confirmação humana** (cláusula do CLAUDE.md inalterada).
- O gate escreve um schema descartável em produção (não-destrutivo a dado real, auto-limpo) — coberto pela
  âncora de backup-do-dia.
- **Achado:** o exportador histórico **incluía colunas geradas** no INSERT, produzindo dump **não-restaurável**
  para `analytics.dim_operacao_weddings` (`resultado_caixa`/`ncg`). O exportador versionado as exclui (o schema
  recomputa na restauração via `LIKE INCLUDING GENERATED`); o restore-test do gate cobre essa tabela.

## Follow-ups registrados (NÃO neste escopo)
- **Restore-test em modo COMPLETO** (todas as tabelas) — incremento que um dia destravaria a autonomia destrutiva.
- **Performance:** o restore via Management API roda um statement por chamada (mitigado por batelagem); o ganho
  real é uma **conexão Postgres direta** (`COPY`), que dependeria da connection string do banco.
- **Durabilidade off-machine** dos backups (hoje só em `~/wt-finance-backups/`).
