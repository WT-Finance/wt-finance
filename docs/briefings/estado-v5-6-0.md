# Estado da v5.6.0 — Gestão de Pessoas: Inventário de Ativos

Arquivo de reancoragem entre fases (fronteira de fase = estado em disco + `/clear`).
Briefing: `docs/briefings/briefing-v5-6-0-inventario-patrimonio.md`.
Referência funcional (untracked, na raiz): `docs/referencias/patrimonio_welcome_group.html`.

## Onde estamos

**M0 CONCLUÍDA E APROVADA pelo Yan em 10/08.** Próxima: **M1 (banco)** — mas ver "Bloqueios".

| Missão | Estado |
|---|---|
| M0 mockups no DS (gate) | ✅ aprovada (`10bce7e` + ajustes em `645b859`) |
| M1 banco | ⏸ bloqueada — ver abaixo |
| M2 seção + rota + permissão | pendente |
| M3 ativos: lista/ficha/cadastro | pendente |
| M4 movimentação + razão | pendente |
| M5 visão geral + export | pendente |
| M6 fechamento | pendente |

Gates da fronteira pós-M0: `tsc` limpo · lint limpo · **754 testes** · `build` OK.

## Bloqueios (decisão do Yan)

1. **Seed de áreas e categorias** — checkpoint previsto no briefing. Proposta no fixture:
   áreas = Diretoria, Financeiro, Comercial, Operações, Marketing, Tecnologia, Gestão de
   Pessoas; categorias = as 6 do briefing (Informática, Mobiliário, Eletrônicos, Telefonia,
   Veículos, Outros). **Vira `INSERT` na migration da M1 — confirmar antes.**
2. **Um ativo pode NASCER em estoque?** O briefing crava que status é função só do tipo, e por
   isso `cadastro → em uso` (área + detentor obrigatórios): quem quiser cadastrar direto no
   estoque precisa cadastrar e depois fazer `devolucao_estoque`. Se a resposta for "sim, pode
   nascer em estoque", muda o CHECK por tipo da M1 — decidir **antes** de escrever a migration.

## Numeração real (o WORKING-CONTEXT do main está velho)

- **Próxima migration livre: `0247`.** O main vai até `0245`; a **`0246` é da 5.5.1**, que
  ainda não mergeou.
- **Próximo ADR livre: `0167`** (`0163` segue reservado pela versão em stand-by; a 5.5.1 só
  emenda o `0166`).

## Convivência com a 5.5.1 (em implementação em paralelo)

Zero sobreposição de código de feature (ela é Weddings). O atrito é só em arquivos
compartilhados:

- `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts` → **tocar SÓ na M6**,
  depois que a 5.5.1 mergear, com `git merge origin/main` antes.
- `src/lib/schemas-rpc.ts`, `src/types/api.ts`, `src/lib/rpc-contrato.test.ts` → acrescentar em
  bloco novo no fim, nunca reorganizar o que existe.
- ⚠️ Aplicar migration de branch não mergeada trava o `db push` de toda outra branch
  (`LegacyDbPushMissingLocalError`, v5.4.4). **Avisar a sessão da 5.5.1 ao aplicar a `0247`.**

## A dívida que a M2 tem de quitar (não esquecer)

A área definitiva `gestao-pessoas/inventario` **não existe ainda**. O teste de contrato
(`rpc-contrato.test.ts:523`) exige paridade exata entre `AREAS` e `app.rbac_areas`, então
declará-la em código sem a migration quebra o `npm test` — e a M0 não podia aplicar migration.

Hoje **três pontas** apontam para a área existente `admin/design-system`:

1. `src/app/gestao-pessoas/inventario/page.tsx` → `requireArea('admin/design-system')`
2. `src/components/layout/sidebar.tsx` → `GESTAO_PESSOAS_SUBS[0].area` (+ `emConstrucao: true`)
3. `src/lib/auth/areas.ts` → `areasDaRota('/gestao-pessoas')`

A M2 vira as três **no mesmo commit** da migration que insere a área em `app.rbac_areas`, e
acrescenta a entrada em `AREAS`/`AREA_INFO`. O caso `['/gestao-pessoas/inventario',
['admin/design-system']]` em `src/lib/auth/areas.test.ts` **reprova** quando isso acontecer —
é o lembrete mecânico de que nenhuma ponta pode ficar para trás.

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

## Limite conhecido de verificação visual

A conferência autônoma não passou do login: pelo MCP do Chrome a rota só é alcançável pelo IP
do WSL (`http://<ip>:3000`, porque o browser roda no Windows e não enxerga o `localhost` do
WSL2) e **não há sessão do Janus nesse browser** — o agente não digita credenciais. O modelo
que funciona segue sendo **entregar → Yan manda print → ajustar** (v5.4.1).
