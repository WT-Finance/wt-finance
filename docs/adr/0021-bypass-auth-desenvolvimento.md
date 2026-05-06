# ADR 0021 — BYPASS_AUTH em desenvolvimento (proibido em produção)

**Data:** 2026-05-06
**Status:** Aceito
**Versão:** V4-1

## Contexto

A partir de V4-2, todas as rotas exigem login. Isso cria atrito em desenvolvimento local: a cada `npm run dev`, seria necessário fazer login via magic link. Para iteração rápida, é necessária uma rota de escape.

## Decisão

A variável de ambiente `BYPASS_AUTH=true` em `.env.local` faz o middleware ignorar a verificação de sessão. O middleware checa duas condições para ativar o bypass:

```ts
if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
  return NextResponse.next()
}
```

### Por que duas condições?

`NODE_ENV` é definido pelo runtime de deploy (Vercel → `'production'`), não pela variável de ambiente do projeto. Mesmo que `BYPASS_AUTH=true` apareça nas variáveis de produção por engano, `NODE_ENV !== 'development'` garante que o bypass não ativa. Dupla proteção intencional.

### `.env.local` não é commitado

O arquivo `.env.local` está no `.gitignore`. `BYPASS_AUTH=true` nunca entra no repositório. Novos desenvolvedores que clonem o repo não terão o bypass — precisam criá-lo manualmente (documentado no README).

## Consequências

**Positivas:**
- Desenvolvimento local sem fricção de autenticação
- Seguro em produção por design (dupla proteção)

**Negativas / trade-offs:**
- Desenvolvedor pode testar sem perceber que está em modo bypass — comportamentos de permissão diferem do ambiente real
- Mitigação: comentário explícito em `.env.local` e esta ADR como referência
