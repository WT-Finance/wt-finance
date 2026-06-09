# ADR 0029 — /admin/uploads sem proteção de autenticação na v3.4

**Status:** Aceito (temporário)  
**Data:** Maio/2026  
**Versão:** v3.4-1

## Contexto

A página `/admin/uploads` permite importar planilhas e alterar toda a base de dados do dashboard. Em produção, qualquer pessoa com a URL poderia fazer upload e sobrescrever os dados.

A v3.4 mantém o dashboard público (sem login), como todas as versões anteriores. O login está planejado para v4.

## Decisão

**Sem proteção de auth na v3.4.** A página é acessível por URL direta sem autenticação.

## Motivo

- Implementar auth parcial só para admin seria complexidade desproporcional para uma versão que deliberadamente adiou login.
- O risco é aceito conscientemente: o dashboard é interno, a URL `/admin/uploads` não está linkada na UI principal, e o fluxo tem confirmação (modal antes de executar).
- Adicionar auth agora criaria dependência com a arquitetura de v4 antes de ela estar definida.

## Consequências

- Qualquer pessoa com a URL pode fazer upload. Mitigação: URL não está na navegação, fluxo tem confirmação explícita.
- Quando v4 implementar login, `/admin/uploads` **será protegida automaticamente** pelo proxy de autenticação — sem precisar de mudança no código da página.
- Esta decisão deve ser revisada se o dashboard se tornar mais público antes de v4 chegar.

## Reavaliação — junho/2026 (pós-auditoria, v4.12)

A auditoria técnica pós-v4.11 (achado F1) reapontou o risco: as rotas de upload (`/admin/uploads` e as API Routes `upload-vendas`/`upload-lancamentos`/`gerencial/import`) substituem toda a base e **não têm autenticação** (não há middleware nem checagem de identidade no projeto). Reavaliado conscientemente e **mantido** por ora: produto interno, URL não-linkada na navegação, fluxo com preview/confirmação antes de executar, e — desde a v4.12 — **ingestão atômica** (ADR-0104) que impede que uma carga deixe a base vazia. **Revisitar** assim que a exposição mudar (ex.: domínio público, mais usuários) — endurecer auth/admin permanece a frente recomendada. (F1 ficou **fora** do escopo da v4.12 por decisão do usuário.)
