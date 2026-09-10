# D6 — Dependências

Explorador D6 (Sonnet, read-only) sobre `_insumos/depcheck.txt`, `knip.txt`, `npm-outdated.txt`,
`npm-audit.json`. Skill lida: `ingestao-planilhas`. Formato: `README.md` desta pasta.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D6-001 | `depcheck` marca `tailwindcss` e `@tailwindcss/postcss` como devDependencies não usadas — falso positivo: entram via `postcss.config.mjs` (plugin) e `@import "tailwindcss"` em `src/app/globals.css:1` | `_insumos/depcheck.txt:1-3`; `postcss.config.mjs:3`; `src/app/globals.css:1` | baixo | S | manter; registrar exceção conhecida | documentar | | |
| D6-002 | `@typescript-eslint/parser` é usado diretamente em `src/lib/carga/coercao-lint.sonda.test.ts:2` mas não está declarado no `package.json` — entra só como transitiva de `eslint-config-next`→`typescript-eslint` (peer `^8.59.1`); se essa cadeia mudar, a sonda quebra sem aviso (= D1-014) | `_insumos/depcheck.txt:5`; `package-lock.json:8382-8387` | médio | S | declarar `@typescript-eslint/parser` como devDependency explícita (mesma versão resolvida hoje) | corrigir | | |
| D6-003 | `next` 16.2.9 (direta) tem 2 CVEs **critical** (RCE Windows, RCE AVIF Image Optimization) e várias high/moderate na faixa `>=16.0.0 <16.3.3`; fix é **minor** (16.3.4), não major | `_insumos/npm-audit.json` (`vulnerabilities.next`, `fixAvailable.version=16.3.4`, `isSemVerMajor:false`) | baixo | S | `npm install next@16.3.4 eslint-config-next@16.3.4` — minor de segurança, não é a atualização major vedada pelo escopo; gates completos depois | corrigir | | |
| D6-004 | `nodemailer` 9.0.1 (direta) tem 4 CVEs moderate/high (bypass de disableFileAccess/disableUrlAccess, bypass de allow-list de domínio IDN, DoS quadrático no addressparser) — fix é **major** (10.0.3) | `_insumos/npm-audit.json` (`vulnerabilities.nodemailer`); `_insumos/npm-outdated.txt:13` | médio | L | decidir migração para `nodemailer@10` (breaking) — fora do escopo de limpeza; backlog v6 com nota de SEGURANÇA | decidir | | |
| D6-005 | `vitest` 3.2.6 (direta) e transitiva `@vitest/mocker` têm CVE moderate (path traversal / arbitrary file read via redirect mock); fix é major (`vitest@5.0.0`) | `_insumos/npm-audit.json` (`vulnerabilities.vitest`, `["@vitest/mocker"]`, `fixAvailable.isSemVerMajor:true`) | médio | L | backlog v6: upgrade `vitest` 3→5 (breaking) | decidir | | |
| D6-006 | 7 vulnerabilidades adicionais (moderate a high) em transitivas do toolchain — `postcss`/`sharp` (via `next`, mesmo fix 16.3.4), `brace-expansion`, `browserslist`, `js-yaml`, `nanoid`, `esbuild`, `@babel/core` — nenhuma é direta | `_insumos/npm-audit.json` (`metadata.vulnerabilities`: critical 1, high 7, moderate 3, low 2, total 13) | baixo | S | resolvidas em cascata pelo `next@16.3.4` (postcss/sharp) e por `npm audit fix` SEM major para as demais (checar cada `fixAvailable` antes) | corrigir | | |
| D6-007 | `@supabase/ssr` tem major pendente 0.10→0.12 (0.x = major por semver) e patch 0.10.2→0.10.3 disponível | `_insumos/npm-outdated.txt:2` | baixo | L (major) / S (patch) | patch 0.10.3 é candidato; salto para 0.12 no backlog v6 (checar changelog) | documentar | | |
| D6-008 | Majors pendentes fora do escopo (briefing: framework/major = backlog v6): `@types/node` 20→22, `eslint` 9→10, `typescript` 5.9→7.0, `vitest` 3→5 (D6-005) | `_insumos/npm-outdated.txt:5,9,20,21` | alto | L | registrar em `docs/backlog-v6.md` com risco por item (TS 7 e ESLint 10 quebram regras/config) | decidir | | |
| D6-009 | Patches/minors sem major pendente (`@supabase/supabase-js` 2.105→2.116, `@types/react*` 19.2→19.3, `date-fns` 4.1→4.4, `lucide-react` 1.14→1.44, `pg` 8.21→8.23, `react`/`react-dom` 19.2.4→19.3.0, `recharts` 3.8.1→3.10.1, `tsx` 4.21→4.23, `zod` 4.4→4.6) | `_insumos/npm-outdated.txt` | baixo | M | não agir na limpeza (não atualiza por rotina); registrar lista para rotina periódica | documentar | | |
| D6-010 | `pg` está em devDependencies e só é usado em testes/scripts que fazem asserção direta no banco; nenhum código de produção o importa — consistente com a convenção v5.9.6 (skill §6) | `src/lib/monde/virada-paridade.test.ts:22`; `src/lib/api-externa/contrato-api-externa.test.ts:61,150`; `src/lib/sonda-teste-escreve-banco.test.ts:77-79` | baixo | S | nenhuma ação — convenção respeitada | documentar | | |
| D6-011 | `server-only` (`^0.0.1`) tem uso real — 33 arquivos em `src/` o importam | grep `server-only` em `src/` → 33 arquivos | baixo | S | manter | documentar | | |
| D6-012 | `dotenv` (devDependency) tem uso real fora de teste: `scripts/db-gate/lib.mjs`, `scripts/limpeza-anexos-solicitacoes.mjs`, `supabase/seed/*.ts`, `vitest.setup.ts` | grep `dotenv` no repo (21 arquivos) | baixo | S | manter | documentar | | |
| D6-013 | `lucide-react` é importado com named imports em 76 arquivos — não há `import *`; peso real do bundle não medido nesta fase | grep `from 'lucide-react'` em `src/` → 76 arquivos | baixo | S | medir na Fase 2 (`next build`) | documentar | | |
| D6-014 | `recharts` e `@vercel/speed-insights/next` importados por caminho nomeado (não `import *`) — padrão correto para tree-shaking; peso fica para a Fase 2 | `src/app/layout.tsx:12`; grep `from 'recharts'` | baixo | S | nenhuma ação nesta fase | documentar | | |

## Síntese

Nenhuma dependência do `package.json` está genuinamente órfã: as duas "não usadas" do depcheck (Tailwind) são falso positivo do plugin CSS/PostCSS, e `pg`/`dotenv`/`server-only` têm uso real confirmado. O achado que exige correção de código é `@typescript-eslint/parser` não declarado. O risco maior é **segurança**: `next` tem 2 CVEs critical com fix **minor** (16.3.4, dentro do escopo da limpeza); `nodemailer` e `vitest` têm CVEs moderate/high mas o fix é **major** — decisão/backlog v6.

## Contagem por classe

documentar 8 · corrigir 3 · decidir 3 · apagar 0 · simplificar 0 — **total 14**.

## Achei, não vou agir

- Medição real de peso de bundle (item 6) — não há `next build` nesta fase; D6-013/D6-014 só registram o padrão de import.
- Contagem de ícones distintos do `lucide-react`.
- Resolução fina de qual `fixAvailable` de cada uma das 13 vulnerabilidades transitivas é major/minor — fica para quem aplicar (D6-006).

## Riscos fora do escopo

- `next` 16.2.9 tem RCE **critical** em produção hoje (Windows-hosted e AVIF Image Optimization) — item de maior severidade da dimensão; fix minor e de baixo risco de regressão. Vale escalar independentemente da triagem.
- `nodemailer` tem bypass de allow-list de domínio (entrega a domínio controlado por atacante) — relevante pela skill `email`; fix exige major → decisão humana.
