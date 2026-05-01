# ADR 0012 — Default da Aba Executiva: Mês Anterior

**Data:** Maio 2026
**Status:** Aceito
**Missão:** V3.1-1

## Contexto

A Aba Executiva abria por padrão em "Este mês". Como a carga de dados é manual (`npm run seed`), nos primeiros dias de cada mês o dashboard mostrava tela vazia ou dados incompletos — o que gerava má impressão, especialmente em contexto de apresentação à diretoria.

## Decisão

Default da Aba Executiva alterado para **"Mês anterior"**.

Isso garante que ao abrir o dashboard, o usuário sempre vê o último mês fechado com dados completos.

A Aba Performance mantém "Este ano (YTD)" como default — não foi alterada.

## Consequências

- Dashboard nunca abre vazio, independente do dia do mês ou status da carga.
- Usuário precisa selecionar "Este mês" manualmente quando quiser ver o mês corrente.

## Condição de reversão

Quando a integração com RPA (Power Automate) estiver concluída e os dados forem atualizados continuamente (sem carga manual), reverter o default para **"Este mês"**. Atualizar este ADR na ocasião.
