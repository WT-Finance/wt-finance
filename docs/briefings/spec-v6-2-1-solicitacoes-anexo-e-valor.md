# Spec v6.2.1 — Solicitações: anexo que não baixava e "valor inválido" na abertura

Patch pedido pelo Yan em 06/10/2026 (rota B: investigação → plano aprovado na sessão). Dois sintomas
relatados: (1) alguns anexos não abrem/baixam; (2) ao abrir uma solicitação, às vezes "algum campo está
com valor inválido" — suspeita no campo de valor, mesmo com valor normal.

## Diagnóstico (medido em produção, leitura apenas, 06/10)

Os dois sintomas são **uma cadeia só**:

1. O usuário anexa um arquivo na abertura → o binário sobe para `tmp/<uuid>/<arq>`.
2. Digita o valor como `1.234,56`. A tela aceita `[\d.,-]`; o banco
   (`app.solic_validar_e_snapshotar`, 0212) aceita `^-?[0-9]+([.,][0-9]+)?$` — **um separador só** —
   e recusa com `VALOR_INVALIDO`, que a tela traduzia para o genérico "Há um valor inválido em um dos
   campos".
3. Na recusa, `criarSolicitacao` **apagava do Storage os anexos já enviados** ("limpeza de órfãos"),
   mas o modal continuava com os metadados na mão, mostrando o anexo como enviado.
4. O usuário corrige o valor e reenvia → a solicitação nasce apontando para binários que não existem
   mais → o move `tmp/ → sol/<id>/` falha em silêncio (`mvErr` descartado) → o download responde
   `Object not found` e a tela mostra "Não foi possível gerar o link do anexo".

Evidência:
- **25 de 141 anexos** com binário ausente, de 12/08 a 05/10/2026. Todos ainda com `storage_path` em
  `tmp/`, todos da abertura, todos anexados pelo próprio solicitante, e **nenhum objeto com aquele UUID
  em lugar nenhum do bucket** — compatível só com o passo 3. Em solicitações com anexos mistos (#1385:
  3 anexos, 2 bons), os bons são os adicionados depois da tentativa recusada.
- A migration 0220 (que apagou 20 binários de propósito) é de 31/07 — anterior ao 1º caso; descartada.
- Valores `moeda` gravados: 76 `1234,56`, 41 inteiros, 6 `988.50`, 3 `1.318`, **zero** `1.234,56` —
  o formato mais natural em pt-BR nunca passou.
- Gatilho mais largo que o valor: `CAMPO_OBRIGATORIO` também passa pelo passo 3 (a tela não confere
  os obrigatórios dos campos dinâmicos antes de enviar).

## Escopo

### M1 — Anexos sobrevivem à recusa (`src/app/solicitacoes/actions.ts`)
- `criarSolicitacao` **não apaga mais** os anexos quando a RPC recusa. O reenvio usa os mesmos
  binários. Custo aceito: se o usuário desistir, sobra um órfão em `tmp/` — o mesmo que já sobra quando
  ele fecha o modal sem enviar (20 hoje).
- Falha do `move` e falha (`{ error }`) de `solic_promover_anexos` passam a ser **logadas** — os
  `catch` mudos não viam nada porque o SDK não lança.
- `anexarEmSolicitacao` **não muda**: o drawer recria os metadados a cada tentativa, então apagar no
  erro ali é correto.

### M2 — Valor aceita o formato pt-BR (`format.ts`, modal, `campos-dinamicos.tsx`)
- `valorNumericoCanonico(tipo, digitado)`: lê pelo `toNum` canônico (R$, espaço, milhar BR/US) e emite
  vírgula decimal sem milhar — a forma de 76 dos 126 valores já gravados. `moeda` sai com 2 casas
  (arredondamento do `toCentavos`); `numero` mantém as casas que tem.
- O modal normaliza **no envio** (nunca no `onChange`, ou não daria para digitar `1.234,56`). O que não
  dá para ler para na tela com o nome do campo, sem ir ao banco.
- **Decisão do Yan:** prévia abaixo do campo — "Será registrado como R$ 1.318,00" — saída do mesmo
  `fmtValor` que o drawer usa depois. Desambigua `1.318` (mil trezentos e dezoito).
- Banco e API externa **inalterados** (sem migration).

### M3 — Mensagem de erro diz qual campo (`traduzir`)
- `CAMPO_OBRIGATORIO: <rótulo>` → `Preencha o campo obrigatório "<rótulo>".`
- `VALOR_INVALIDO: <detalhe>` → o detalhe da RPC (ex.: "Data do pagamento não admite data no passado.").
- Sem detalhe, o dicionário antigo segue valendo.

### M4 — Os 25 anexos perdidos (**decisão do Yan: aviso na tela, sem mexer nos dados**)
- Os binários não têm recuperação (só o solicitante tem a cópia).
- `anexoUrl` distingue binário ausente (`indisponivel: true`) de falha genérica; o drawer marca a linha
  como "Arquivo indisponível" e, para quem pode anexar, diz para reenviar em "Outros anexos".
- 5 dos 25 seguem em andamento e aceitam reenvio: #920, #2307, #2400 (abertas), #2192, #2401 (aprovadas).

## Fora do escopo (registrado)
- Varredura de órfãos em `tmp/` (coleta periódica) — lixo inofensivo, não listado nem baixável.
- Validação client-side dos campos obrigatórios dinâmicos (o servidor já recusa, agora com o nome do
  campo, e sem perder anexo).
- A API externa tem o mesmo limite de um separador (o doc diz "aceitam vírgula") — integrador manda
  formato de máquina; não mexido.
- Quirk do `toNum`: vírgula seguida de 3 dígitos é milhar US (`0,125` → 125). A prévia deixa à vista.
