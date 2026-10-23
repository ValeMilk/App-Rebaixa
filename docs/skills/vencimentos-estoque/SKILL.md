---
name: vencimentos-estoque
description: Responde perguntas sobre vencimento, validade, giro e rebaixa do estoque das lojas (produtos Valemilk contados pelos promotores no Ativmob), consultando o MCP do BI (Postgres) com a mesma regra do Painel de Vencimentos do Rebaixa/InfoVale. Use sempre que perguntarem o que está vencendo, o que vence em X dias, o que entra em giro ou rebaixa, quais lojas têm produto perto do vencimento, quantas unidades estão a vencer, shelf, lote, validade, ou quem contou e quando foi a última visita do promotor numa loja, mesmo que a pessoa não use as palavras "giro" ou "rebaixa".
---

# Vencimentos do estoque nas lojas

Esta skill faz o mesmo raciocínio do **Painel de Vencimentos** do app Rebaixa (InfoVale). O número que você responder precisa bater com o do painel. Por isso:

- **Use a consulta abaixo como está** e mexa só nos pontos marcados com `[FILTRO...]`.
- **Não use** a view `vw_ativmob_estoque_critico`: ela só olha a última visita de cada produto e perde lotes que o promotor não recontou.
- **Não calcule shelf nem vencimento por conta própria**: a regra já está na consulta.

## Fonte dos dados

- `public.ativmob_estoque`: contagens feitas pelos promotores nas lojas (Ativmob). Uma linha por produto e validade contados numa visita.
- `public.shelf`: vida útil de cada produto em dias (`shelf_dias`).
- É **contagem de promotor, não saldo do ERP**. O dado pode ter até 30 dias de idade.

## Como responder

1. Entenda o recorte: loja, produto, status (rebaixa ou giro), prazo ("vence em 15 dias"). Sem recorte, não despeje as ~2.700 linhas: mostre o resumo por status e os itens mais urgentes.
2. Rode a consulta pela ferramenta de SQL somente leitura do MCP do BI (`consultar_sql`). Só `SELECT`/`WITH`, **uma única instrução e sem `;` em lugar nenhum, nem dentro de comentário** (a ferramenta recusa). Se mexer na consulta, não coloque `;` no texto. O limite de tempo é de 15 segundos, então prefira filtrar e agregar.
3. Responda com quantidade, validade, dias para vencer e status. Diga **quem contou e quando** (contagem do lote e última visita à loja), porque o dado tem idade.
4. Resultado vazio significa que nenhum lote cumpre a regra (ver "Regras"). Não afirme que a loja está sem estoque.

## Consulta

```sql
WITH base AS (
  -- Contagens dos ultimos 30 dias, de lojas identificadas
  SELECT
    e.id, e.codigo_destino, e.nome_fantasia_dest, e.produto_codigo, e.produto_nome,
    COALESCE(e.quantidade, 0) AS quantidade, e.data_validade,
    e.agent_name, e.agent_code, e.event_dth, e.event_dth::date AS data_visita
  FROM public.ativmob_estoque e
  WHERE NULLIF(TRIM(e.codigo_destino), '') IS NOT NULL
    AND e.event_dth::date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
    -- [FILTRO DE LOJA, opcional e seguro aqui] AND e.codigo_destino = '12427'
),
visitas AS (
  -- Ultima visita do promotor a cada loja (qualquer produto, inclusive "sem produto")
  SELECT DISTINCT ON (codigo_destino) codigo_destino,
    to_char(event_dth, 'YYYY-MM-DD"T"HH24:MI') AS visita_em, agent_name AS visita_por, event_dth::date AS visita_data
  FROM base
  ORDER BY codigo_destino, event_dth DESC, id
),
sem_estoque AS (
  -- Ultima visita em que a promotora registrou que NAO havia o produto: quantidade zero sem lote
  -- (validade vazia ou nao futura). Cancela os lotes contados antes dela.
  SELECT codigo_destino, produto_codigo, MAX(data_visita) AS data_zero
  FROM base
  WHERE quantidade = 0 AND (data_validade IS NULL OR data_validade <= data_visita)
  GROUP BY codigo_destino, produto_codigo
),
ultima_do_lote AS (
  -- A ULTIMA CONTAGEM DE CADA LOTE (loja + produto + validade), nao a ultima visita do produto.
  -- No mesmo dia vale a menor quantidade e, em empate, a contagem mais recente.
  SELECT DISTINCT ON (codigo_destino, produto_codigo, data_validade)
    codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome, quantidade, data_validade,
    agent_name, agent_code, data_visita,
    to_char(event_dth, 'YYYY-MM-DD"T"HH24:MI') AS contado_em
  FROM base
  WHERE data_validade IS NOT NULL
  ORDER BY codigo_destino, produto_codigo, data_validade, data_visita DESC, quantidade, event_dth DESC, id
),
vigentes AS (
  -- O lote sai quando: venceu, foi recontado com zero, houve visita posterior sem o produto, ou a loja
  -- foi visitada mais de 14 dias depois da contagem dele (nao foi reencontrado: assume-se que acabou)
  SELECT u.*,
    SUM(u.quantidade) OVER (PARTITION BY u.codigo_destino, u.produto_codigo) AS estoque_total,
    MAX(u.data_visita) OVER (PARTITION BY u.codigo_destino, u.produto_codigo) AS ultima_visita
  FROM ultima_do_lote u
  JOIN visitas lv ON lv.codigo_destino = u.codigo_destino
  LEFT JOIN sem_estoque z ON z.codigo_destino = u.codigo_destino AND z.produto_codigo = u.produto_codigo
  WHERE u.data_validade > CURRENT_DATE
    AND u.quantidade > 0
    AND (z.data_zero IS NULL OR u.data_visita >= z.data_zero)
    AND (lv.visita_data - u.data_visita) <= 14
),
lotes AS (
  SELECT
    v.codigo_destino, v.nome_fantasia_dest, v.produto_codigo, v.produto_nome,
    v.quantidade, v.data_validade, s.shelf_dias AS shelf,
    -- Por lote: 73% ou mais do shelf consumido = rebaixa (3), 45% ou mais = giro (2), ok (1), sem shelf (0)
    CASE WHEN COALESCE(s.shelf_dias, 0) <= 0 THEN 0
         WHEN s.shelf_dias - (v.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.73) THEN 3
         WHEN s.shelf_dias - (v.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.45) THEN 2
         ELSE 1 END AS peso,
    v.agent_name, v.agent_code, v.contado_em,
    (v.data_visita = v.ultima_visita) AS na_ultima_visita
  FROM vigentes v
  LEFT JOIN public.shelf s ON TRIM(s.produto_codigo) = TRIM(v.produto_codigo::text)
  -- So produtos com estoque relevante na loja: mais de 5 unidades (2 para os itens de caixa)
  WHERE v.estoque_total > CASE WHEN v.produto_codigo::text IN ('121035', '121135', '121235', '121835') THEN 2 ELSE 5 END
),
agg AS (
  SELECT
    codigo_destino, MAX(nome_fantasia_dest) AS nome_fantasia_dest,
    produto_codigo, MAX(produto_nome) AS produto_nome, MAX(shelf) AS shelf,
    MAX(peso) AS peso_max,
    SUM(quantidade)    FILTER (WHERE peso >= 2) AS qtd_acao,
    MIN(data_validade) FILTER (WHERE peso >= 2) AS validade_acao,
    SUM(quantidade)    AS qtd_total,
    MIN(data_validade) AS validade_min,
    json_agg(json_build_object(
      'dataValidade', to_char(data_validade, 'YYYY-MM-DD'),
      'quantidade', quantidade,
      'peso', peso,
      'agente', agent_name,
      'agenteCodigo', agent_code,
      'contadoEm', contado_em,
      'naUltimaVisita', na_ultima_visita
    ) ORDER BY data_validade) AS lotes
  FROM lotes
  GROUP BY codigo_destino, produto_codigo
),
sel AS (
  -- So lotes em giro/rebaixa entram na soma, item sem nenhum deles sai (exceto sem shelf)
  SELECT *,
    CASE WHEN peso_max >= 2 THEN qtd_acao      ELSE qtd_total    END AS quantidade,
    CASE WHEN peso_max >= 2 THEN validade_acao ELSE validade_min END AS data_validade
  FROM agg
  WHERE peso_max >= 2 OR peso_max = 0
),
resultado AS (
  SELECT
    codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome,
    quantidade, data_validade, shelf,
    (data_validade - CURRENT_DATE) AS dias_para_vencer,
    CASE WHEN COALESCE(shelf, 0) <= 0 THEN NULL
         ELSE ROUND(GREATEST(0, LEAST(1, (shelf - (data_validade - CURRENT_DATE))::numeric / shelf)), 4) END AS pct_shelf,
    CASE peso_max WHEN 3 THEN 'rebaixa' WHEN 2 THEN 'giro' ELSE 'sem_shelf' END AS status_shelf,
    lotes, v.visita_em, v.visita_por
  FROM sel
  LEFT JOIN visitas v USING (codigo_destino)
)
SELECT codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome, quantidade, data_validade,
       dias_para_vencer, shelf, pct_shelf, status_shelf, lotes, visita_em, visita_por
FROM resultado
WHERE true
  -- [FILTROS OPCIONAIS, aqui no fim] AND produto_codigo = '...'   AND status_shelf = 'rebaixa'
  --   AND dias_para_vencer <= 15   AND nome_fantasia_dest ILIKE '%atacadao%'
ORDER BY data_validade, codigo_destino, produto_codigo
```

## Ajustes permitidos

| Pedido | Como |
|---|---|
| Uma loja (por código) | Descomentar `AND e.codigo_destino = '...'` dentro de `base`. É o único lugar seguro para filtrar loja. |
| Várias lojas (ex.: as de uma rede) | `AND e.codigo_destino IN ('...', '...')` dentro de `base`. |
| Loja por nome | `AND nome_fantasia_dest ILIKE '%...%'` no fim. |
| Produto | `AND produto_codigo = '...'` ou `AND produto_nome ILIKE '%...%'` no fim. **Nunca dentro de `base`**: isso estraga a "última visita da loja". |
| Só rebaixa ou só giro | `AND status_shelf = 'rebaixa'` (ou `'giro'`) no fim. |
| Prazo | `AND dias_para_vencer <= 15` no fim. |
| Totais e rankings | Cortar a consulta antes do `SELECT` final e agregar sobre `resultado` (exemplos abaixo). |

Resumo por status:

```sql
SELECT status_shelf, COUNT(*) AS itens, SUM(quantidade) AS unidades
FROM resultado GROUP BY status_shelf
```

Dez lojas com mais unidades em rebaixa:

```sql
SELECT codigo_destino, nome_fantasia_dest, COUNT(*) AS itens, SUM(quantidade) AS unidades
FROM resultado WHERE status_shelf = 'rebaixa'
GROUP BY codigo_destino, nome_fantasia_dest ORDER BY unidades DESC LIMIT 10
```

Se a ferramenta limitar linhas, agregue ou use `LIMIT` em vez de pedir tudo.

## Como ler as colunas

- `quantidade`: soma **só dos lotes em giro ou rebaixa**. Lotes ainda "ok" não entram.
- `data_validade`: a do lote mais próximo do vencimento entre os que entram na soma.
- `status_shelf`: o pior status entre os lotes (rebaixa pesa mais que giro). `sem_shelf` é produto sem shelf cadastrado: entra com todos os lotes.
- `pct_shelf`: parte da vida útil já consumida, de 0 a 1.
- `dias_para_vencer`: validade menos hoje. Lote vencido nunca aparece.
- `lotes` (JSON): todos os lotes do item, inclusive os ok. Cada lote traz:
  - `dataValidade` e `quantidade`;
  - `peso`: 3 = rebaixa, 2 = giro, 1 = ok (não entra na soma), 0 = sem shelf;
  - `agente` e `agenteCodigo`: o promotor que contou;
  - `contadoEm`: data e hora da contagem;
  - `naUltimaVisita`: `false` quando o lote não foi recontado na última visita do produto. Ele continua valendo pela contagem antiga, e vale avisar isso.
- `visita_em` e `visita_por`: última visita do promotor à loja, de qualquer produto.
- `codigo_destino` é o código do cliente (o mesmo do app e do Lacteus). O nome da loja vem do Ativmob.

## Regras (o porquê da consulta)

1. **Janela de 30 dias.** Só contagens dos últimos 30 dias, de lojas identificadas. Lote que ninguém recontou nesse prazo deixa de valer.
2. **O lote é a unidade** (loja + produto + validade) e vale pela sua última contagem. No mesmo dia vale a menor quantidade e, em empate, a mais recente. Contar um lote novo não apaga um lote antigo.
3. **O lote sai** quando venceu, quando foi recontado com zero, ou quando uma visita posterior registrou que não havia o produto (quantidade zero, sem validade futura). Essa visita cancela os lotes contados antes dela.
4. **Lote não reencontrado (regra de 23/10/2026).** Se a **última visita à loja** (de qualquer produto, até uma que só registrou "sem produto" de outro item) foi **mais de 14 dias depois** da última contagem do lote, assume-se que o lote não existe mais e ele sai. Com exatamente 14 dias de diferença ele fica. Por isso o filtro de produto nunca vai dentro de `base`: a última visita da loja tem que enxergar todos os produtos.
5. **Estoque mínimo.** A soma de todos os lotes vigentes (inclusive os ok) na loja precisa passar de **5 unidades** (**2** para os códigos 121035, 121135, 121235 e 121835).
6. **Status de cada lote pelo shelf**, olhando quanto da vida útil já foi consumida (shelf menos dias que faltam):

   | Consumido do shelf | Status |
   |---|---|
   | 73% ou mais | rebaixa |
   | 45% ou mais | giro |
   | menos de 45% | ok |
   | produto sem shelf | sem shelf |

   Exemplo: com shelf de 30 dias, vira giro quando faltam 16 dias ou menos e rebaixa quando faltam 8 ou menos.
7. **Uma linha por loja + produto.** Quantidade e validade vêm só dos lotes em giro ou rebaixa; o status é o pior. Item que só tem lotes ok não aparece.

Exemplo: lote A com 10 un (ok), lote B com 8 un (giro) e lote C com 4 un (rebaixa). O total é 22, então passa do mínimo. A linha mostra **12 un**, a validade do lote C e status **rebaixa**. O lote A aparece só dentro de `lotes`, como "não entra na soma".

## Cuidados ao responder

- **Status e prazo são critérios diferentes.** Rebaixa e giro vêm do % do shelf consumido. "Vence em 15 ou 30 dias" é só contagem de dias. Se a pergunta for "o que está vencendo", mostre os dois (status e dias). Faixas por dias usadas no app: crítico até 15, alerta até 30, atenção até 60.
- **A consulta não filtra por carteira.** No app, vendedor e supervisor só enxergam as próprias lojas; aqui isso não existe. Responda só o que a pessoa pediu.
- **Rede e cidade não vêm desta consulta.** Para "por rede", obtenha os códigos das lojas em outra fonte (por exemplo o Lacteus, se houver conector) e filtre com `IN (...)` em `base`. Se não houver como, diga que o recorte por rede não está disponível aqui.
- **Preço de compra, venda e saldo do ERP não vêm daqui.** Use a fonte certa e diga qual usou.
- **Lote que não aparece mais** pode ter saído por qualquer uma das regras 1 a 5. A mais comum hoje é a do lote não reencontrado: se a pessoa estranhar a ausência de um lote, confira a data da última contagem dele e a da última visita à loja.
- **Se a regra mudar**, ela precisa mudar no app (`backend/src/services/estoqueSyncService.js`, no repositório do Rebaixa) e nesta skill ao mesmo tempo: janela de 30 dias, 14 dias sem recontagem, mínimo de 5 (e 2), limites de 73% e 45% e a lista de códigos de caixa. Atualize juntas a consulta e a seção "Regras".
