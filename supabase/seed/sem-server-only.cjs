// Preload do seed (v6.0.1): o seed roda FORA do Next, e o núcleo da ingestão
// (`src/lib/ingestao/*`) importa `server-only`, que lança de propósito em qualquer ambiente que não
// seja um Server Component. Este preload faz o `require('server-only')` resolver para um módulo
// vazio — e SÓ ele; nenhum outro pacote é tocado. O `tsx` compila o seed para CommonJS, então o hook
// fica no resolvedor do `require`.
//
// Uso: `tsx --require ./supabase/seed/sem-server-only.cjs supabase/seed/seed.ts` (o `npm run seed`
// já passa o flag).
// Sem `require()` de propósito (a regra `no-require-imports` do lint vale aqui também): no
// CommonJS, `module.constructor` É a classe `Module`, e `__dirname` basta para montar o caminho.
const Module = module.constructor
const VAZIO = __dirname + '/server-only-vazio.cjs'
const resolverOriginal = Module._resolveFilename

Module._resolveFilename = function (request, ...resto) {
  if (request === 'server-only') return VAZIO
  return resolverOriginal.call(this, request, ...resto)
}
