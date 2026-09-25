# Fixtures dos oráculos de ingestão (v6.0.0)

Esta pasta é **gitignorada** de propósito: os anexos são exports internos do Monde (Vendas cru
traz CPF/CNPJ/e-mail — decisão 3 da v6.0.0) e o conjunto passa de 30 MB.

O que é versionado é o **manifest** — `scripts/ingestao/fixtures-manifest.json` — com nome
canônico, arquivo de origem, base, papel (cru/tratado/auxiliar) e **sha256**. Para popular:

```bash
JANUS_ANEXOS_DIRS="<pasta1>:<pasta2>" node scripts/ingestao/fixtures.mjs
node scripts/ingestao/fixtures.mjs --verificar
```

Hash divergente aborta: outro export não é a fixture, e o oráculo mediria outra coisa.

Os testes de oráculo (`src/lib/ingestao/oraculo-*.test.ts`) **se auto-pulam nomeando** a fixture
ausente — nunca em silêncio (padrão cobrado por `src/lib/sonda-skipif-silencioso.test.ts`).
