# Estado da v5.6.0 — Gestão de Pessoas: Inventário de Ativos

Arquivo de reancoragem entre fases (fronteira de fase = estado em disco + `/clear`).
Briefing: `docs/briefings/briefing-v5-6-0-inventario-patrimonio.md`.
Referência funcional (untracked, na raiz): `docs/referencias/patrimonio_welcome_group.html`.

## Onde estamos

**M0 aprovada e M1 CONCLUÍDA (banco no ar).** Próxima: **M2** (abas/a11y + varredura de
não-regressão da navegação) e **M3** (ligar a tela nas RPCs).

| Missão | Estado |
|---|---|
| M0 mockups no DS (gate) | ✅ aprovada (`10bce7e` + ajustes do Yan em `645b859`) |
| M1 banco | ✅ **0247 e 0248 APLICADAS**; área RBAC no ar; 60/60 na verificação REST |
| M2 seção + rota + permissão | 🟡 parcial — a **permissão** já virou junto da M1 (`62abb38`); falta o molde de abas/a11y e a varredura de não-regressão |
| M3 ativos: lista/ficha/cadastro | pendente — a tela ainda roda sobre `fixture.ts` |
| M4 movimentação + razão | pendente |
| M5 visão geral + export | pendente |
| M6 fechamento | pendente |

Gates da fronteira pós-M1: `tsc` limpo · lint limpo · **779 testes** · `build` OK.

## Decisões do Yan (10/08) — as duas que bloqueavam a M1

1. **Seed confirmado:** categorias = Informática, Mobiliário, Eletrônicos, Telefonia,
   Veículos, Outros; áreas = Diretoria, Financeiro, Comercial, Operações, Marketing,
   Tecnologia, Gestão de Pessoas. Já semeados pela 0247.
2. **Um ativo PODE nascer em estoque.** Isso quebra "status = função só do tipo": o
   `cadastro` passou a ter dois desfechos. Resolvido derivando do MESMO registro —
   cadastro COM detentor → em uso; SEM detentor → em estoque. Um tipo novo
   (`cadastro_estoque`) duplicaria a abertura no enum e no CHECK sem ganhar nada.

## Estado do banco

- **`0247` (estrutura) e `0248` (RPCs) APLICADAS** em 10/08, backup-gate VERDE
  (restore-test 3/3, checksum batendo). Backup:
  `~/wt-finance-backups/2026-08-10-pre-migration-164041`.
- **Próxima migration livre: `0249`.** Próximo ADR livre: **`0167`** (`0163` segue reservado
  pela versão em stand-by).
- Base **vazia de propósito**: 0 ativos / 0 movimentações / 0 detentores. Os dados da
  verificação foram removidos e a sequência do código reiniciada, para o primeiro ativo real
  ser o **WG-0001**. Seed intacto (6 categorias, 7 áreas).
- **Parecer do `revisor-db`:** APROVADA COM RESSALVAS nas duas — 0 CRÍTICO, 0 ALTO, 3 MÉDIO,
  4 BAIXO. Como nada havia sido aplicado, os MÉDIOs e 2 BAIXOs foram corrigidos **na origem**
  (`23fd18f`), não como emenda. Registrados e não corrigidos: FKs sem índice dedicado
  (nenhuma é filtrada nas RPCs) e ordenação lexicográfica do código (só afeta override manual
  com número de dígitos diferente).

## Dívida QUITADA: as 4 pontas da área

A área `gestao-pessoas/inventario` existe em `app.rbac_areas` **e** no catálogo do código.
`AREAS`/`AREA_INFO`, `areasDaRota`, o `requireArea` da page e o gate do subitem de sidebar
viraram todos em `62abb38`. O caso plantado em `areas.test.ts` cumpriu o papel: reprovou
exatamente quando devia.

Sobra só o `emConstrucao: true` no subitem — sai na M3, quando a tela deixar o fixture.

## Convivência com a 5.5.1 — RESOLVIDA

A 5.5.1 foi mergeada (#224) e o pós-merge dela também (#225). `origin/main` foi trazido para
dentro da branch: a `0246` chegou junto e local↔remoto voltou a bater (sem isso o `db push`
morreria em `LegacyDbPushMissingLocalError`, a armadilha da v5.4.4). Versão base agora é
**5.5.1** — o bump para 5.6.0 segue sendo assunto da M6.

## Decisões da M0 que valem para as próximas missões

- **`derivar.ts` é a fonte única do contrato tipo → destino/status** na UI. `STATUS_POR_TIPO`
  (8 tipos → 5 status) e `DESTINO_POR_TIPO` viram o CHECK por tipo da M1; o teste de contrato
  da M1 deve comparar as duas pontas.
- **A faixa de contagens inclui "Emprestados"**, que o briefing não listava: sem ela as cinco
  situações não somam o total de cadastrados e o número parece errado na tela.
- **Ícone da seção é `IdCard`** (crachá), não `Users`/`UsersRound` — o `Users` já é "Usuários e
  Acessos" e as variantes redondas são indistinguíveis dele nos 16px da sidebar.
- **O módulo se chama "Inventário de Ativos"** (Ativos em caixa alta), pela convenção dos
  outros rótulos da sidebar. Usar esse nome no ADR, no CHANGELOG e no out-briefing.
- **Status → variante de `<Badge>`:** em uso `success` · em estoque `neutro` · em manutenção
  `warning` · emprestado `gestao` · baixado `danger`. O tipo da movimentação herda a cor do
  status que produz, para lista e timeline contarem a mesma história.
- **A M3 troca o fixture pelas RPCs sem tocar nos componentes** — `AtivoFicha`/`Movimentacao`/
  `AtivoLista` (`tipos.ts`) já são o shape que a M1 deve devolver. `fixture.ts` morre na M3;
  o aviso amarelo de pré-visualização em `inventario-content.tsx` sai junto.
- **Ainda desabilitados, com `title` apontando a missão:** "Novo ativo", "Editar ficha" e
  "Duplicar ativo" (M3); "Exportar CSV" nas duas abas (M5).

## Como verificar o banco de novo (a bateria é reexecutável)

A verificação pós-push é **REST + service_role** — o único caminho que executa o corpo da
função. `npx supabase db query` roda num papel sem JWT e não-superusuário, então
`exigir_acesso` nega **antes** do corpo e mascara qualquer erro de runtime que estivesse lá
dentro (foi assim que a v5.2.1 mandou `max(uuid)` para produção).

A bateria de 60 checagens vive fora do repo (`$CLAUDE_JOB_DIR/tmp/verificar-patrimonio.mjs`).
Ela cria dados marcados com o prefixo `ZZTESTE-M1` e **precisa da limpeza logo depois**:

```sql
DELETE FROM patrimonio.movimentacao WHERE ativo_id IN (SELECT id FROM patrimonio.ativo WHERE descricao LIKE 'ZZTESTE-M1%');
DELETE FROM patrimonio.ativo     WHERE descricao LIKE 'ZZTESTE-M1%';
DELETE FROM patrimonio.detentor  WHERE nome      LIKE 'ZZTESTE-M1%';
ALTER SEQUENCE patrimonio.ativo_codigo_seq RESTART WITH 1;
```

⚠️ `npx supabase db query` cai no banco LOCAL por padrão (e falha por falta de Docker no
WSL2): **é preciso `--linked`** para alcançar produção.

Quando a M3 ligar a tela nas RPCs, os casos desta bateria que exprimem CONTRATO (paridade
SQL↔TS do status derivado, a recusa de localização em `atualizar_ativo`, a retroativa que não
mexe no estado atual) devem migrar para `src/lib/rpc-contrato.test.ts`, que roda no `npm test`.

## Limite conhecido de verificação visual

A conferência autônoma não passou do login: pelo MCP do Chrome a rota só é alcançável pelo IP
do WSL (`http://<ip>:3000`, porque o browser roda no Windows e não enxerga o `localhost` do
WSL2) e **não há sessão do Janus nesse browser** — o agente não digita credenciais. O modelo
que funciona segue sendo **entregar → Yan manda print → ajustar** (v5.4.1).
