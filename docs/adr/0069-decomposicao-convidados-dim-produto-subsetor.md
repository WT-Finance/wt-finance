# ADR-0069 — Decomposição CONVIDADOS via dim_produto_subsetor

**Status:** Aceito  
**Data:** 2026-05-26  
**Versão:** v4.2  

## Contexto

A composição por subsetor na Aba Weddings mostrava CONVIDADOS como uma categoria única, mas operacionalmente Hospedagens e Extras têm naturezas distintas: Diárias de Hospedagem é o custo predominante e previsível; os demais itens (passagens, receptivo, seguros) são variáveis e complementares. A gestora queria ver essa decomposição para análise operacional.

## Decisão

A categoria CONVIDADOS da Composição por Subsetor é dividida em duas linhas:
- **CONVIDADOS - Hospedagens**: somente Diárias de Hospedagem
- **CONVIDADOS - Extras**: Aluguel de Carro, Cruzeiros, Ingressos, Pacote Turístico, Passagem Aérea, Passes de Trem, Receptivo - Traslados e Passeios, Seguro Viagem, Transporte Rodoviário

A classificação é implementada via coluna `subsetor_detalhado TEXT NOT NULL` na tabela `analytics.dim_produto_subsetor`, sem hardcode no front-end. O componente consome `subsetor_detalhado` diretamente da RPC, sem nenhuma lógica de split client-side.

**Implementação (migration 0071):**
```sql
ALTER TABLE analytics.dim_produto_subsetor
  ADD COLUMN subsetor_detalhado TEXT NOT NULL DEFAULT '';

UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = 'CONVIDADOS - Hospedagens'
  WHERE subsetor = 'CONVIDADOS' AND produto = 'Diárias de Hospedagem';

UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = 'CONVIDADOS - Extras'
  WHERE subsetor = 'CONVIDADOS' AND produto != 'Diárias de Hospedagem';

UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = subsetor
  WHERE subsetor != 'CONVIDADOS';
```

A RPC `public.get_sumario_subsetor` foi atualizada (migration 0072) para agrupar por `subsetor_detalhado` em vez de `subsetor`.

## Consequências

**Positivas:**
- Regra de classificação no banco permite ajustes futuros (incluir/remover produtos) sem deploy
- Componente da UI é genérico — consome dado já desagregado
- Apenas CONVIDADOS é dividida nesta versão; outras categorias podem seguir o mesmo padrão

**Trade-offs:**
- Adiciona um nível de indireção (subsetor_detalhado ≠ subsetor para CONVIDADOS)
- Somar CONVIDADOS - Hospedagens + CONVIDADOS - Extras = total antigo de CONVIDADOS (invariante a preservar em migrações futuras)
