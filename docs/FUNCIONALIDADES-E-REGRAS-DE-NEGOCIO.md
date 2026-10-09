# InfoVale (Rebaixa Valemilk) — Fluxos e regras de negócio

Documento funcional do sistema, escrito para a equipe comercial, supervisores, diretoria e administradores. Descreve **como o sistema funciona hoje** (levantado em 29/09/2026): quem faz o quê, em que ordem, e quais regras o sistema aplica em cada passo. Não trata de aspectos técnicos.

---

## Sumário

1. [Para que serve o InfoVale](#1-para-que-serve-o-infovale)
2. [Quem usa e o que cada perfil faz](#2-quem-usa-e-o-que-cada-perfil-faz)
3. [De onde vêm os dados e com que frequência são atualizados](#3-de-onde-vêm-os-dados-e-com-que-frequência-são-atualizados)
4. [Como o sistema decide que um produto precisa de ação](#4-como-o-sistema-decide-que-um-produto-precisa-de-ação)
5. [Fluxo 1 — Rebaixa e oferta interna por loja](#5-fluxo-1--rebaixa-e-oferta-interna-por-loja)
6. [Fluxo 2 — Ação para todas as lojas de uma rede](#6-fluxo-2--ação-para-todas-as-lojas-de-uma-rede)
7. [Fluxo 3 — Aprovação das solicitações](#7-fluxo-3--aprovação-das-solicitações)
8. [Fluxo 4 — Encartes e ofertas internas por rede](#8-fluxo-4--encartes-e-ofertas-internas-por-rede)
9. [Acompanhamento e indicadores](#9-acompanhamento-e-indicadores)
10. [Regras de visibilidade e responsabilidade](#10-regras-de-visibilidade-e-responsabilidade)
11. [Administração do sistema](#11-administração-do-sistema)
12. [Glossário](#12-glossário)
13. [Comportamentos atuais a validar](#13-comportamentos-atuais-a-validar)

---

## 1. Para que serve o InfoVale

O InfoVale apoia a equipe comercial da Valemilk em três frentes:

1. **Evitar perda de produto por vencimento nas lojas dos clientes.** O sistema lê o estoque das lojas, identifica os produtos que estão consumindo a vida útil (shelf) e sugere a ação certa: **oferta interna** para acelerar o giro ou **rebaixa** de preço quando o prazo está curto.
2. **Formalizar e aprovar essas ações.** Cada ação vira uma **solicitação**, com a análise de preço e margem feita pelo comercial, que passa pela aprovação do supervisor e da diretoria.
3. **Planejar e acompanhar as ações promocionais com as redes.** Os **encartes** e as **ofertas internas de rede** são agendados num calendário, precificados produto a produto (PDV, oferta, sellout e margens) e acompanhados em relatórios de performance e cobertura.

Funciona no computador e no celular (pode ser instalado como aplicativo).

---

## 2. Quem usa e o que cada perfil faz

| Perfil | Papel | Telas que enxerga (padrão) |
|---|---|---|
| **Vendedor** | Atende as lojas da própria carteira. Solicita rebaixas e ofertas para elas. | Lojas, Pedidos |
| **Supervisor** | Responde por um grupo de vendedores e por redes. Negocia encartes com as redes e faz a primeira aprovação das solicitações dos seus vendedores. | Métricas Redes, Encartes, Calendário Geral |
| **Diretoria** | Dá a aprovação final das solicitações e acompanha encartes, performance e métricas. | Métricas Redes, Encartes, Calendário Geral, Performance |
| **Administrador** | Tudo o que a diretoria faz, mais o Painel de Vencimentos, as telas Lojas e Pedidos, a Integração Estoque e o Acompanhamento de Estoque e a administração (usuários, responsáveis de rede, redes do InfoVale, sincronização, permissões). | Todas |

A tabela acima é o **padrão**. O administrador pode mudar o que cada perfil abre e faz na tela **Permissões** (seção 11.5): por exemplo, liberar o Painel de Vencimentos para os supervisores.

Um usuário tem um perfil principal e pode receber perfis adicionais; nesse caso ele soma as permissões de todos os seus perfis. As regras de negócio (quais dados ele vê, o que pode editar, como a solicitação dele nasce) seguem sempre o **perfil principal**.

Ao entrar, cada perfil cai na sua tela de trabalho: vendedor em **Lojas**, supervisor em **Métricas Redes**, diretoria em **Encartes**, administrador no **Painel de Vencimentos**. Se essa tela não estiver liberada para o perfil, a pessoa cai na primeira tela do seu menu.

**Acesso**: o usuário escolhe o nome na lista e digita a senha. A senha é o **código do usuário no ERP Lacteus**. A sessão dura 8 horas.

---

## 3. De onde vêm os dados e com que frequência são atualizados

| Informação | Origem | Atualização |
|---|---|---|
| Estoque e validade dos produtos nas lojas | Relatório de estoque crítico da Ativmob (BI) | A cada 30 minutos, e sempre que alguém abre o sistema |
| Carteira: cliente → vendedor → supervisor → rede/subrede | ERP Lacteus | A cada 30 minutos, e sempre que alguém abre o sistema |
| Cadastro de produtos, preços (tabela, mínimo, promo, custo) e shelf | ERP Lacteus | Só manualmente, pela tela Sincronização |
| Clientes do Esigma | ERP Esigma | A cada 30 minutos |
| Produtos do Esigma | ERP Esigma | Só manualmente |
| Última compra de um produto por um cliente ou rede | ERP Lacteus | Consultado na hora, ao abrir um modal de precificação |

Regras de origem que valem a pena conhecer:

- O estoque vem das **contagens das promotoras na Ativmob** dos últimos 15 dias. As regras de quais contagens valem estão na seção 4.2.
- Na carteira, **o supervisor de um cliente é o que está no cadastro do cliente no Lacteus**, não o supervisor do vendedor.
- A carteira exclui rotas de indústria, remessa, licitação e extra-rota, redes marcadas como inativas e algumas redes específicas. Clientes sem rede continuam aparecendo.
- Produtos que deixam de existir no Lacteus **não somem** do sistema automaticamente.
- O Esigma aparece no sistema como uma rede chamada **"Esigma"**, em que **cada cliente é uma subrede**. Os produtos do Esigma **não têm preço** no sistema: a precificação é sempre manual.

---

## 4. Como o sistema decide que um produto precisa de ação

### 4.1 Regra do shelf (a regra principal)

Cada produto tem um **shelf**: a vida útil em dias, cadastrada no ERP. Para cada lote de um produto numa loja, o sistema calcula quantos dias de vida já foram consumidos:

```
consumido = shelf − (dias que faltam para vencer)
```

| Situação | Regra | Ação sugerida |
|---|---|---|
| **Ok** | menos de 45% do shelf consumido | nenhuma |
| **Giro** | de 45% a 73% do shelf consumido | **Oferta interna** |
| **Rebaixa** | 73% ou mais do shelf consumido | **Rebaixa** |
| **Sem shelf** | produto sem shelf cadastrado no ERP | fica visível para tratamento manual |

Os percentuais são arredondados em dias (por exemplo, shelf de 60 dias: giro a partir de 27 dias consumidos, rebaixa a partir de 44).

### 4.2 Consolidação por produto e loja

**Quais contagens valem** (regra de 02/10/2026):

- Cada **lote** (produto + data de validade, numa loja) vale pela **sua última contagem** nos últimos 15 dias. Contar um lote novo numa visita **não apaga** um lote antigo que a promotora não recontou. (Antes valia só a última visita do produto, e os lotes não recontados sumiam do painel.)
- Um lote só deixa de valer quando: **vence**; é **recontado com zero**; uma visita posterior registra que **não há o produto na loja** (quantidade zero sem lote); ou a última contagem dele tem **mais de 15 dias**.
- Se o mesmo lote foi contado mais de uma vez no mesmo dia, vale a menor quantidade e, em empate, a contagem mais recente.
- O produto só entra se o estoque somado dos lotes vigentes na loja passar do mínimo: **mais de 5 unidades** (mais de 2 para quatro códigos específicos).
- Consequência a conhecer: um lote que foi todo vendido, mas que a promotora não registrou como zerado, continua aparecendo até vencer ou até a contagem completar 15 dias. A orientação à equipe de campo é registrar zero quando o lote acabar.

Uma loja pode ter vários lotes do mesmo produto com validades diferentes. O sistema mostra **uma linha por produto e loja**, seguindo estas regras:

- O status é o **pior** entre os lotes.
- A **quantidade** mostrada é a soma **apenas dos lotes em giro ou rebaixa**. Lotes ainda "ok" do mesmo produto não entram na conta, para não inflar a ação.
- A validade mostrada é a **mais próxima** entre os lotes em ação.
- Um produto em que **todos os lotes estão ok não aparece** no sistema.
- Um produto sem shelf aparece com a quantidade total e a validade mais próxima.

### 4.3 Prazo até vencer

Além do shelf, cada item recebe uma faixa de prazo, usada na tela Lojas para priorizar visitas:

| Faixa | Prazo |
|---|---|
| Vencido | já venceu |
| Crítico | 1 a 15 dias |
| Alerta | 16 a 30 dias |
| Atenção | 31 a 60 dias |
| Regular | mais de 60 dias |

---

## 5. Fluxo 1 — Rebaixa e oferta interna por loja

Quem faz: vendedor (tela **Lojas**) ou administrador (tela **Lojas** ou **Painel de Vencimentos**).

### 5.1 Encontrar o produto

- **Lojas** agrupa os produtos por loja e por rede. Redes com mais de uma loja aparecem como um card de rede, com os produtos consolidados (quantidade somada, menor prazo, pior situação e a lista de lojas). A ordem coloca primeiro quem tem mais itens críticos, depois alertas, depois atenção.
- Cada produto mostra a faixa de prazo, a quantidade, a validade, o preço de tabela e, se já houver uma ação em andamento, o selo **"Em oferta"** ou **"Em rebaixa"** com a data em que ela termina.
- O **Painel de Vencimentos** (administrador) mostra a mesma base de outra forma: totais por status (Rebaixa, Giro, Sem shelf), rankings de lojas e produtos com mais unidades a vencer e uma tabela com filtros por rede, loja, produto e "vence até".

### 5.2 Preencher a solicitação

Ao clicar em **Solicitar Rebaixa** (ou **Oferta**), o sistema busca no Lacteus a **última compra** daquele produto por aquela loja (preço e data) e abre o formulário:

| Campo | Regra |
|---|---|
| Preço PDV | obrigatório; preço de venda ao consumidor praticado pela loja |
| Preço da oferta | obrigatório; preço que a loja praticará durante a ação |
| Sellout | desconto em R$ que a Valemilk concede sobre a última compra para viabilizar a oferta; opcional (padrão zero) |
| Motivo | texto livre, opcional |
| Início e Fim da ação | obrigatórios; o fim não pode ser anterior ao início |

O sistema calcula na hora:

```
Margem PDV     = (Preço PDV − Última compra) ÷ Preço PDV
Custo promo    = Última compra − Sellout
Margem oferta  = (Preço da oferta − Custo promo) ÷ Preço da oferta
```

- As margens aparecem coloridas: **verde a partir de 20%**, **amarelo de 10% a 20%**, **vermelho abaixo de 10%**.
- O sistema **sugere um sellout** que mantenha, na oferta, a mesma margem que a loja tem no PDV. A sugestão pode ser aplicada com um clique.
- Se a loja **nunca comprou** o produto, as margens ficam em branco e o formulário avisa; a solicitação pode ser enviada mesmo assim.

### 5.3 Tipo da ação

- No **Painel de Vencimentos**, o tipo segue o status do produto: item em **giro** gera **oferta interna**; item em **rebaixa** ou **sem shelf** gera **rebaixa**.
- Na tela **Lojas**, o botão do produto gera sempre **rebaixa** (ver item 13.3).
- No Painel, o administrador pode marcar vários itens na tabela e criar todas as solicitações de uma vez, com motivo e período comuns e preços por item. Cada item vira **uma solicitação**, do tipo correspondente ao seu status. O botão informa a composição: "Criar N solicitações (x rebaixas · y ofertas)".

### 5.4 O que acontece depois

- A solicitação nasce com o status definido pelo perfil de quem criou (ver Fluxo 3).
- O produto passa a exibir o selo **"Em rebaixa"** ou **"Em oferta"** enquanto a ação estiver em andamento (ver 7.4). Se alguém solicitar de novo, o botão avisa "Nova rebaixa (já existe ação)".

---

## 6. Fluxo 2 — Ação para todas as lojas de uma rede

Na tela **Lojas**, um produto que aparece no card de uma rede pode receber uma ação para **todas as lojas da rede de uma vez**:

1. O usuário clica em **Solicitar Ação (N lojas)** e escolhe **Rebaixa** ou **Oferta**.
2. O formulário mostra a quantidade total na rede, o menor vencimento e a última compra da rede, e os mesmos campos do Fluxo 1 (PDV, oferta, sellout, motivo, período).
3. Ao confirmar, o sistema cria **uma solicitação por loja da rede**, todas com o mesmo tipo, preços, margens, motivo e período; a quantidade e a validade são as de cada loja.
4. Cada solicitação segue o fluxo de aprovação normal.

Hoje a última compra da rede não é encontrada nesse formulário (ver item 13.2), então as margens ficam em branco.

---

## 7. Fluxo 3 — Aprovação das solicitações

### 7.1 Status

| Status | Significado |
|---|---|
| **Ag. Supervisor** | aguardando a primeira aprovação |
| **Ag. Diretoria** | aprovada pelo supervisor, aguardando a aprovação final |
| **Aprovado** | aprovação final concedida |
| **Rejeitado** | recusada em qualquer etapa |
| **Cancelado** | desistência de quem criou |

### 7.2 Onde a solicitação nasce

O status inicial depende de quem cria:

| Quem cria | Nasce como | Supervisor responsável |
|---|---|---|
| Vendedor | Ag. Supervisor | o supervisor da loja na carteira do vendedor |
| Supervisor | Ag. Diretoria (já com a primeira aprovação) | ele mesmo |
| Diretoria ou administrador | Aprovado | não se aplica |

A rede e a subrede da solicitação vêm sempre da carteira do cliente.

### 7.3 Quem decide

- **Supervisor**: decide as solicitações **Ag. Supervisor** dos seus vendedores, aprovando (vai para Ag. Diretoria) ou rejeitando. Se a rede tem um **responsável de rede** cadastrado, **só ele** decide as solicitações daquela rede.
- **Diretoria e administrador**: decidem as solicitações **Ag. Diretoria** (aprovação final ou rejeição) e também podem aprovar ou rejeitar **diretamente** uma solicitação que ainda está Ag. Supervisor.
- A decisão pode levar um comentário, opcional inclusive na rejeição. Tudo fica registrado no histórico da solicitação (quem, quando, o quê).
- Na tela **Pedidos**, solicitações da mesma rede e produto aparecem agrupadas e podem ser decididas de uma vez ("Decidir todas").

Atenção: decidir exige a permissão "Aprovar ou rejeitar solicitações", que por padrão só diretoria e administrador têm. Enquanto ela não for marcada para o perfil Supervisor na tela Permissões, a etapa do supervisor não acontece (ver item 13.1).

### 7.4 Cancelamento e ação ativa

- **Cancelar**: só quem criou a solicitação (ou o administrador), e apenas enquanto ela está Ag. Supervisor ou Ag. Diretoria.
- **Ação ativa**: uma solicitação conta como ativa enquanto não foi rejeitada nem cancelada **e** a data de fim da ação ainda não passou. É isso que gera os selos "Em rebaixa" / "Em oferta" nas telas Lojas e Painel. Depois da data de fim, o produto volta a aparecer sem selo e pode receber nova ação.

### 7.5 Consulta

- **Vendedor** vê só as solicitações que criou.
- **Supervisor** vê as que criou, as pendentes que aguardam a decisão dele e todas as das redes em que é responsável.
- **Diretoria e administrador** veem todas.
- A tela Pedidos filtra por status (Ag. Supervisor, Ag. Diretoria, Aprovados, Rejeitados). O detalhe mostra o período da ação, a análise de preços item a item (última compra, PDV e margem, oferta e margem, sellout, desconto) e o histórico completo.

---

## 8. Fluxo 4 — Encartes e ofertas internas por rede

### 8.1 O que é

Um **encarte** é uma ação promocional combinada com uma **rede** (ou com uma subrede específica dela), com nome, período e uma lista de produtos precificados. Existem dois tipos:

- **Encarte**: ação promocional tradicional, divulgada pela rede.
- **Oferta interna**: ação promocional interna da rede.

Um encarte é considerado **negociado** quando já tem ao menos um produto precificado. Enquanto o período não terminou, ele é **ativo**; depois, **finalizado**.

### 8.2 Quem cria e quem edita

- O **supervisor** cria encartes nas redes que atende (da sua carteira ou pelas quais é responsável).
- Se a rede tem um **responsável de rede**, só ele cria e edita os encartes dela. Se não tem, qualquer supervisor que atende a rede pode criar, e cada encarte é editado por quem o criou.
- O **administrador** cria e edita em qualquer rede.
- A **diretoria** vê e edita tudo, mas não cria (ver item 13.5).
- Quem não pode editar abre o encarte em modo **Visualização**.
- O vendedor não tem acesso a encartes.

### 8.3 Criar a ação

Na tela **Encartes**, o usuário escolhe a rede (ou uma subrede) e clica em **+ Nova Ação**:

1. Escolhe o tipo: **Oferta Interna** ou **Encarte**.
2. Informa o nome, para quem se aplica (**toda a rede** ou uma subrede), início e fim (o fim não pode ser anterior ao início).
3. O sistema abre o detalhe do encarte, ainda sem produtos.

Não há impedimento para períodos sobrepostos na mesma rede.

### 8.4 Precificar os produtos

No detalhe do encarte, **+ Adicionar Produto** abre o fluxo de precificação por subcategoria:

1. Escolhe a **categoria** (opcional) e a **subcategoria** (obrigatória). O sistema lista os produtos ativos da subcategoria, todos já marcados; o usuário desmarca os que não entram.
2. Para cada produto, o sistema mostra o preço de **Tabela (70)**, o **Mínimo**, o **Promo** e a **última compra da rede** (a compra mais recente daquele produto por qualquer loja da rede). No topo aparecem as **médias** dos produtos selecionados.
3. O usuário define **um preço único para a subcategoria**: Preço PDV, Preço de oferta e Sellout. O sistema mostra as margens em tempo real, com as mesmas fórmulas do Fluxo 1, usando a última compra média.
4. Ajudas de precificação:
   - **Sugerir sellout**: calcula o desconto proporcional à diferença entre PDV e oferta (`última compra × (PDV − oferta) ÷ PDV`).
   - **Partir da margem**: clicando na margem, o usuário digita a margem desejada e o sistema calcula o preço correspondente (PDV a partir da margem PDV; oferta a partir da margem de oferta).
5. Regras: PDV e oferta são obrigatórios; a **margem da oferta não pode ser maior que a margem PDV**.
6. Ao salvar, cada produto entra no encarte com as margens calculadas **com a sua própria última compra** (não com a média). Produtos sem última compra ficam com margens em branco.

Cada produto pode depois ser **editado individualmente** (PDV, oferta, sellout; mesmas regras) ou **removido**. O nome, o período e a subrede do encarte também podem ser alterados; o encarte pode ser excluído (com confirmação).

Para a rede **Esigma**, não há preços de tabela nem última compra: tudo é digitado manualmente.

### 8.5 Calendário da rede e Calendário Geral

- A tela **Encartes** mostra o mês em formato de calendário, com cada ação ocupando os dias do seu período. Ofertas internas aparecem em **preto**; encartes, em cores. Um ✅ indica ação negociada.
- Filtros: Negociação (todos, negociados, não negociados), Tipo (encartes, ofertas internas) e Subrede.
- Passando o mouse sobre uma ação, aparece um resumo por subcategoria: preço médio de oferta, sellout médio e margem média.
- O **Calendário Geral** reúne todas as redes que o usuário enxerga, com uma cor fixa por rede. Diretoria e administrador podem filtrar pelo supervisor que criou as ações.

### 8.6 PDF para a rede

- Na tela Encartes: **PDF** gera o material da rede selecionada, com período opcional (se as duas datas forem informadas, entram as ações que tocam esse período; senão, todas as ações da rede).
- No Calendário Geral: **PDF Geral** gera um documento com as redes escolhidas, uma rede por página.
- O PDF traz, por período, as seções **Encartes** e **Ofertas internas**, cada ação com sua subrede e a lista de produtos com o **preço de oferta**. Não imprime PDV, sellout nem margens.

---

## 9. Acompanhamento e indicadores

### 9.1 Painel de Vencimentos (administrador)

Visão macro → micro do estoque em risco:

- **Totais**: itens monitorados e unidades; quantos em Rebaixa, Giro, Sem shelf e Ok; barra com a composição percentual.
- **Horizonte**: filtra tudo para "vence em até 15 dias" ou "até 30 dias".
- **Lojas mais críticas** (top 10): por unidades a vencer ou por criticidade (rebaixas pesam mais que giros). Clicar numa loja filtra a tabela.
- **Produtos com mais unidades a vencer** (top 10). Clicar num produto filtra a tabela.
- **Detalhe por loja**: tabela ordenável (loja, produto, quantidade, validade, dias, status) com busca, filtros por rede, loja e "vence até", seleção em lote e botão de ação por linha. Quando a quantidade é soma de mais de um lote, a linha avisa ("soma de N lotes").
- **Última visita do promotor**: sob o nome da loja (no painel e na tela Lojas) aparece a data e hora da última contagem feita naquela loja, de qualquer produto, com o nome do promotor ao passar o mouse. Vem do Ativmob, na sincronização.
- **Exportar planilha**: com itens selecionados, gera um Excel com ID da loja, loja, código e nome do produto, estoque, data de validade, dias para vencer, última visita do promotor e promotor, **preço da última compra da loja no Lacteus**, a data dessa compra e de onde veio o preço. Quando a loja não compra em nome próprio (compra pelo CD da rede, ou tem outro código no Lacteus), entra a **última compra da rede**. Respeita o alcance de dados de quem exporta (vendedor e supervisor só levam as próprias lojas). Se o Lacteus não responder, as colunas de compra saem vazias.
- **Detalhes da contagem** (botão em cada linha): mostra de onde veio o número.
  - **Como chegamos nesse número**: uma linha por lote (data de validade) com a quantidade, os dias e o percentual do shelf, a situação, **quem contou** (nome e código do promotor) e **quando**. Os lotes em giro ou rebaixa formam a soma; os lotes ainda "ok" aparecem marcados como "não entra na soma". O total bate com a quantidade do painel.
  - A janela avisa quando algum lote **não foi recontado na última visita** do produto (ele continua valendo pela sua última contagem).
  - **Histórico de contagem por lote**: para cada data de validade, as contagens dos últimos 60 dias num **gráfico de linha** (eixo horizontal: quando foi contado; eixo vertical: quantidade), com a contagem usada no painel destacada. "Ver em tabela" mostra quem contou e a **variação** em relação à contagem anterior do mesmo lote.
  - **Visitas em que o lote não foi contado**: quando a promotora visitou a loja e contou outros lotes do produto, mas não aquele, a visita aparece marcada com × no gráfico. Se isso aconteceu depois da última contagem do lote, o bloco avisa "Não contado na última visita" (ou "nas últimas N visitas"), com as datas, e uma linha tracejada mostra que o painel continua usando a contagem antiga.
  - Lotes que já saíram (vencidos, zerados ou com contagem antiga) aparecem em blocos separados, assim como as **visitas em que a promotora registrou que não havia o produto** (quantidade zero, sem lote). Essas visitas cancelam os lotes contados antes delas.
  - Se existir uma contagem mais nova que o painel ainda não refletiu, a janela avisa; ela entra na sincronização seguinte (a cada 30 minutos).

### 9.2 Métricas Redes (supervisor, diretoria, administrador)

Mede a **cobertura de negociação** de cada rede no **mês atual**:

- **Dias totais**: dias do mês em que a rede tem alguma ação (encarte ou oferta interna) agendada.
- **Dias negociados**: dias cobertos por ações que já têm produtos precificados.
- **Cobertura** = dias negociados ÷ dias totais. Rede sem nenhuma ação no mês fica em 0%.

Faixas: **0% = Crítico**, **abaixo de 40% = Urgente**, **abaixo de 70% = Atenção**, **70% ou mais = Boa**. A tela permite filtrar por faixa, por tipo de ação e, para diretoria e administrador, por supervisor. Cada card mostra também as subredes e os três produtos mais usados; clicar leva à agenda da rede.

O supervisor vê apenas as suas redes.

### 9.3 Performance de encartes (diretoria, administrador)

Compara dois períodos (por padrão, o mês atual e o anterior), com filtros por rede e por supervisor criador:

- **Indicadores**: número de encartes, margem média da oferta, preço médio da oferta e total de itens, com a variação entre os períodos (para preço médio, **cair é bom**).
- **Sellout por subcategoria**: desconto médio concedido em cada período e a variação.
- **Lista de encartes**: rede, supervisor, vigência, status (ativo/finalizado), itens, margem média e preço médio, com detalhe por subcategoria.

Entram no período as ações que **começam ou terminam** dentro dele (ver item 13.6).

### 9.4 Acompanhamento de Estoque (administrador)

Painel construído sobre os **retratos de estoque** gravados pela Integração Estoque (ver 11.4). A cada planilha recebida e confirmada, um novo retrato passa a existir e o painel acompanha a evolução do estoque da rede entre eles.

**Como usar:** escolher a rede e o retrato (por padrão, o mais recente) e com o que comparar (por padrão, o retrato anterior; pode ser nenhum ou outro retrato). Quem ainda não tem retrato vê um convite para importar a primeira planilha.

**Indicadores do retrato** (cada um mostra a variação em relação ao retrato de comparação):

| Indicador | O que é |
|---|---|
| Valor em estoque | Soma do valor do estoque de todas as lojas e produtos do retrato |
| Venda de 30 dias | Soma da venda em R$ dos últimos 30 dias, com o equivalente por dia |
| Cobertura | Quantos dias o estoque dura no ritmo de venda, considerando as linhas que vendem |
| Rupturas | Linhas sem estoque e com venda no período |
| Estoque parado | Valor das linhas com estoque e **sem nenhuma venda** em 30 dias |
| Excesso | Valor das linhas com mais de 60 dias de cobertura |

**Cobertura de cada linha (loja x produto)** = estoque ÷ venda diária, onde a venda diária é a quantidade vendida em 30 dias dividida por 30. A coluna DDE enviada pela rede é só conferência e nunca entra nas decisões.

**Status de cada linha** (cada linha tem um só):

| Status | Regra |
|---|---|
| Ruptura | Estoque zero e com venda nos últimos 30 dias |
| Saldo negativo | Estoque abaixo de zero (inconsistência do arquivo; mantido como veio, inclusive resíduos como -0,002) |
| Cobertura baixa | Até 7 dias |
| Cobertura adequada | De 7 a 30 dias |
| Cobertura alta | De 30 a 60 dias |
| Excesso | Mais de 60 dias |
| Sem giro | Tem estoque e não vendeu nos 30 dias |
| Zerado sem venda | Sem estoque e sem venda |

**Cobertura geral da rede:** compara o estoque a custo com o custo da venda diária, nas linhas que vendem, têm custo informado e saldo igual ou maior que zero. Linhas em ruptura entram só no denominador, que é o que puxa a cobertura para baixo.

**Do macro ao micro:** indicadores e barra de distribuição por status, gráfico de evolução (valor em estoque e venda de 30 dias em cada retrato; clicar num ponto abre aquele retrato), ranking de lojas (por valor, rupturas, menor cobertura ou estoque parado), ranking de produtos (por valor, lojas em ruptura ou estoque parado) e a tabela de detalhe por loja e produto, com busca e filtros por loja, categoria e status. Clicar numa loja, num produto ou num status filtra a tabela.

**Regras de fidelidade:**

- **Produto fantasma** nunca entra em nenhum número. Marcar um código como fantasma depois remove o produto do acompanhamento de **todos** os retratos, inclusive dos antigos.
- O nome da loja e do produto mostrado é sempre o do cadastro **atual**. Quem ainda não foi cadastrado ou identificado continua entrando nos números, pelo código e nome que vieram no arquivo, e o painel avisa quantos são.
- Os números não são arredondados; só a exibição é formatada.
- Os limites das faixas (7, 30 e 60 dias) valem para todas as redes.

---

## 10. Regras de visibilidade e responsabilidade

1. **A carteira define o alcance de cada um.** O vendedor enxerga as lojas em que é o vendedor cadastrado; o supervisor, as lojas e redes em que é o supervisor cadastrado; diretoria e administrador enxergam tudo.
2. **O responsável de rede prevalece sobre a carteira.** O administrador pode designar um supervisor como responsável por uma rede. A partir daí, só ele edita os encartes dessa rede e decide as solicitações pendentes dela, e ele passa a enxergar a rede mesmo que ela não esteja na sua carteira: **todas as lojas da rede** entram no alcance dele (Painel de Vencimentos, Lojas, solicitações que ele mesmo abre e planilha exportada), somadas às lojas da própria carteira.
3. **Redes inativas** no Lacteus não aparecem em nenhuma tela.
7. **Subrede = subclasse do cliente no Lacteus.** Em Encartes, a subrede pode ser escolhida direto, sem passar pela rede (a rede é preenchida sozinha). Cliente que **não tem rede** cadastrada no Lacteus, mas tem subclasse, entra no InfoVale com a subclasse fazendo o papel de rede (código "S" + número da subclasse); a última compra dessa "rede" é a dos clientes da subclasse.
4. **A rede Esigma** é vista por diretoria e administrador; um supervisor só a vê se for designado responsável por ela.
5. **Solicitações**: vendedor vê as próprias; supervisor vê as próprias, as que aguardam a sua decisão e as das redes pelas quais é responsável; diretoria e administrador veem todas.
6. **Encartes**: supervisor vê as redes que atende; diretoria e administrador veem todas.

---

## 11. Administração do sistema

Por padrão, todas as telas abaixo são exclusivas do administrador. Com exceção de Permissões, podem ser liberadas a outros perfis (seção 11.5).

### 11.1 Usuários

- Cadastro com nome, e-mail, **código Lacteus (que é a senha inicial)**, código Esigma (opcional), perfil principal e perfis adicionais.
- E-mail e códigos não podem se repetir. Trocar o código do usuário troca a senha dele.
- **Desativar** remove o usuário da lista de acesso; ele não é apagado. Não há reativação pela tela.
- Existe uma rotina de carga que cria vendedores e supervisores a partir da carteira do Lacteus (e-mail `código@valemilk.com.br`, senha igual ao código).

### 11.2 Responsabilidades de rede

- Associa **uma rede a um supervisor responsável** (um por rede). A rede precisa existir na carteira (ou ser a Esigma) e o usuário precisa ter o perfil principal de supervisor.
- Efeitos descritos na seção 10.

### 11.3 Sincronização

- Botões para atualizar manualmente: Estoque (Ativmob), Carteira e Produtos/Preços do Lacteus (juntos ou separados), Carteira e Produtos do Esigma (juntos ou separados).
- A tela mostra se há uma atualização em andamento e o resultado da última.
- Produtos e preços só são atualizados por aqui: não há atualização automática do cadastro de produtos.

### 11.4 Integração Estoque (planilha de estoque da rede)

Tela exclusiva do administrador (por enquanto) para receber a **planilha de estoque e venda dos últimos 30 dias** que uma rede envia por e-mail. Esta etapa só **lê, reconhece e guarda** a planilha; não gera pedidos nem altera o estoque do Painel.

**Fluxo, em uma página só:**

1. Escolher a **rede (cliente)** e soltar o arquivo Excel (.xlsx). O arquivo não tem layout garantido: o sistema procura o cabeçalho nas primeiras 15 linhas e reconhece as colunas **pelo nome**, em qualquer ordem.
2. O sistema mostra o resumo: linhas válidas e descartadas, lojas e produtos reconhecidos e o valor total em estoque.
3. **Colunas novas** pedem uma decisão na hora: associar a um campo existente, ignorar ou criar um campo novo. O nome decidido é guardado para aquela rede e reconhecido sozinho nas próximas planilhas. Se faltar um campo obrigatório (produto, loja, estoque, quantidade vendida, venda, valor do estoque), a gravação fica bloqueada e a tela diz qual falta.
4. **Data do retrato**: inferida do título da planilha ou do nome do arquivo (que não trazem o ano). Nunca é gravada sem a pessoa confirmar.
5. **Lojas**: reconhecidas pelo **código que a rede usa**, nunca pelo nome (que varia entre remessas). Nenhuma loja nasce sozinha: as não cadastradas aparecem com um nome sugerido, editável, para cadastro em lote.
6. **Produtos**: o mesmo produto tem códigos diferentes em cada sistema. Os não reconhecidos recebem até 3 sugestões por semelhança de nome contra o cadastro de produtos do Lacteus, com a porcentagem de semelhança. Nada é vinculado sem confirmação; a sugestão só vem pré-marcada quando é forte e se destaca das demais, e **não vem marcada** se outro código do arquivo aponta para o mesmo item (típico de um produto fantasma) ou se o item já está vinculado a outro código. Também é possível buscar o item manualmente.
7. **Produto fantasma**: código da rede que não corresponde a nenhum produto real. Marcado uma vez, fica fora da análise para sempre e nunca mais volta como pendência.
8. **Confirmar importação** grava o **retrato** (uma foto do estoque naquele dia) e o arquivo original, mesmo com pendências em aberto: o dado bruto nunca espera o cadastro ficar perfeito.

**Regras de fidelidade:**

- Nenhum valor é corrigido ou arredondado (estoque negativo e resíduos como -0,002 ficam como vieram).
- Célula vazia vira zero só nos campos usados em cálculo (estoque e venda); nos informativos (custo, DDE, idade) fica em branco.
- Linha sem produto ou sem loja não é dado: vai para **linhas descartadas**, com o número da linha original e o motivo. Linhas válidas mais descartadas sempre somam o total de linhas do arquivo.
- A quantidade vendida é sempre o acumulado de 30 dias; nunca venda diária.
- O retrato é imutável. Erro se corrige reenviando o arquivo. **Reenviar o mesmo arquivo** não duplica: o sistema informa quando e por quem foi importado.
- O arquivo original de cada retrato pode ser baixado a qualquer momento (auditoria).

### 11.5 Permissões (o que cada perfil pode abrir e fazer)

O acesso é controlado **por perfil**: cada usuário tem um perfil (Vendedor, Supervisor, Diretoria ou Admin), cada perfil tem um conjunto de permissões, e a tela Permissões mostra essa matriz para o administrador marcar e desmarcar.

**Permissões existentes**

| Grupo | Permissão | Quem tem por padrão |
|---|---|---|
| Painéis | Painel de Vencimentos (Dashboard) | Admin |
| Painéis | Métricas Redes | Supervisor, Diretoria, Admin |
| Painéis | Acompanhamento de Estoque | Admin |
| Lojas e solicitações | Tela Lojas | Vendedor, Admin |
| Lojas e solicitações | Tela Solicitações | Vendedor, Admin |
| Lojas e solicitações | Criar rebaixa ou oferta interna | Todos |
| Lojas e solicitações | Aprovar ou rejeitar solicitações | Diretoria, Admin |
| Encartes | Encartes e Calendário Geral | Supervisor, Diretoria, Admin |
| Encartes | Criar nova ação | Supervisor, Admin |
| Encartes | Performance de encartes | Diretoria, Admin |
| Estoque das redes | Integração Estoque | Admin |
| Administração | Usuários | Admin |
| Administração | Responsáveis de rede | Admin |
| Administração | Redes do InfoVale | Admin |
| Administração | Sincronização manual | Admin |
| Administração | Permissões | Somente Admin |

**Regras**

- O padrão acima é o acesso que cada perfil já tinha antes de a tela existir. Enquanto o administrador não alterar um perfil, nada muda para ele.
- **O perfil Admin tem sempre todas as permissões** e não pode ser editado, para ninguém ficar trancado para fora. A permissão de editar a matriz é exclusiva dele.
- Algumas permissões **não se aplicam ao Vendedor** (Métricas Redes, Encartes, Criar nova ação, Aprovar solicitações), porque dependem de redes atribuídas ou de uma etapa de aprovação que o vendedor não tem.
- **A permissão libera a tela ou a ação; os dados continuam os de cada um.** Um supervisor que ganha o Painel de Vencimentos vê nele só as lojas das suas redes; um vendedor, só a própria carteira.
- Sem a permissão, a tela some do menu, o endereço direto leva a pessoa de volta para a tela inicial dela e o sistema recusa a operação. Os botões de criar solicitação, criar ação e aprovar só aparecem para quem tem a permissão correspondente.
- A alteração vale na hora. Quem está com o sistema aberto vê o menu novo ao voltar para a aba ou recarregar a página.
- Cada perfil alterado aparece como **Personalizado** (com quem alterou e quando) e pode voltar ao padrão com **Restaurar padrão**.
- Um perfil sem nenhuma permissão continua entrando no sistema, mas vê apenas o aviso de que não há tela liberada.
- Aprovar solicitações continua seguindo as etapas: com a permissão, o supervisor decide a primeira etapa e diretoria e admin a final (seção 7.3).

### 11.6 Redes InfoVale (lojas que só existem no Ativmob)

**De onde vem a rede de uma loja.** O Ativmob informa apenas o código e o nome da loja. A rede vem do cadastro do cliente no Lacteus, pelo mesmo código. Uma loja contada no Ativmob que não está na carteira do Lacteus aparece **sem rede** e não entra na carteira de nenhum supervisor.

**O que a tela faz.** Permite criar uma rede dentro do InfoVale para essas lojas:

1. Dar um **nome** à rede nova ou, se a rede já existe no Lacteus (caso de uma rede que tem parte das lojas só no Ativmob), escolher a opção **"Rede que já existe no Lacteus"** e selecioná-la. Nesse caso as lojas escolhidas se somam às que a rede já tem; nada muda no Lacteus.
2. Escolher **um ou mais supervisores**: a rede entra na carteira de cada um deles.
3. **Selecionar as lojas** entre as que tiveram contagem no Ativmob nos últimos 90 dias e não estão no Lacteus.

**Regras**

- A rede criada vale como qualquer outra: aparece no Painel de Vencimentos e em Lojas, nos filtros por rede, em Encartes e no Calendário, e pode receber responsável de rede.
- Os supervisores escolhidos passam a ver as lojas e a rede; os demais, não. Rede sem supervisor é vista só por diretoria e administrador.
- Uma loja só pode estar em **uma** rede do InfoVale, e o nome não pode repetir o de outra rede (do InfoVale ou do Lacteus).
- **O Lacteus tem precedência.** Se a loja for cadastrada depois no Lacteus, passa a valer a rede de lá; na tela ela fica marcada como "No Lacteus" e pode ser retirada da rede.
- A rede criada aqui não é apagada pela sincronização da carteira.
- Essas lojas não têm vendedor (não existem na carteira de vendas) e a rede não tem histórico de compra no Lacteus: a análise de preço de ações por rede fica sem a última compra.
- Uma rede com ações cadastradas em Encartes não pode ser excluída; dá para tirar lojas e supervisores dela.
- Por padrão só o administrador usa a tela; pode ser liberada a outros perfis em Permissões.

---

## 12. Glossário

| Termo | Significado |
|---|---|
| **Shelf** | Vida útil do produto em dias, cadastrada no ERP. |
| **Giro** | Produto com 45% a 73% do shelf consumido; pede oferta interna. |
| **Rebaixa** | Produto com 73% ou mais do shelf consumido; e também a solicitação de redução de preço para uma loja. |
| **Oferta interna** | Ação promocional para acelerar o giro: pode ser uma solicitação para uma loja ou uma ação de rede no calendário. |
| **Encarte** | Ação promocional negociada com uma rede, com produtos precificados. |
| **Negociado** | Encarte que já tem produtos precificados. |
| **Carteira** | Vínculo cliente → vendedor → supervisor → rede/subrede, vindo do Lacteus. |
| **Rede / Subrede** | Grupo de lojas de um cliente e a bandeira ou loja específica dentro dele. Exibido como "REDE — SUBREDE". |
| **Responsável de rede** | Supervisor designado pelo administrador para responder por uma rede; prevalece sobre a carteira. |
| **Última compra** | Preço e data da venda mais recente de um produto para uma loja (ou para qualquer loja da rede). |
| **PDV** | Preço de venda ao consumidor praticado pela loja. |
| **Sellout** | Desconto em R$ que a Valemilk concede sobre a última compra para viabilizar a oferta. |
| **Custo promo** | Última compra menos o sellout: o custo efetivo do produto para a loja durante a ação. |
| **Margem PDV / Margem oferta** | (PDV − última compra) ÷ PDV e (oferta − custo promo) ÷ oferta. |
| **Tabela 70** | Tabela de preços de rede do Lacteus; o "preço de tabela" do produto. |
| **Ação ativa** | Solicitação não rejeitada nem cancelada cujo período ainda não terminou. |
| **Cobertura** | Nas Métricas Redes, a proporção dos dias com ação no mês que já estão negociados. |
| **Retrato** | Foto do estoque de uma rede em um dia, gravada a partir da planilha enviada (Integração Estoque). Não pode ser editado. |
| **Produto fantasma** | Código do cadastro da rede que não corresponde a nenhum produto real; fica fora da análise. |
| **Esigma** | Segundo ERP; aparece como a rede "Esigma", em que cada cliente é uma subrede, sem preços. |

---

## 13. Comportamentos atuais a validar

Situações em que o sistema se comporta de um jeito que provavelmente não é o desejado. Cabe ao negócio decidir se são erros a corrigir ou regras a manter.

1. **O supervisor não aprova por padrão.** O fluxo prevê a primeira aprovação pelo supervisor, mas o perfil Supervisor não tem, por padrão, nem a tela Solicitações nem a permissão de aprovar; só diretoria e administrador aprovam ou rejeitam, e toda solicitação de vendedor depende da diretoria. Para ativar a etapa do supervisor, basta marcar as duas permissões para o perfil na tela Permissões (seção 11.5).
2. **Ação por rede fica sem margens.** Ao solicitar para todas as lojas de uma rede, a última compra nunca é encontrada; as solicitações são criadas com PDV e oferta, mas sem margem calculada.
3. **Na tela Lojas toda ação nasce como rebaixa**, mesmo para produtos em giro, que deveriam gerar oferta interna (como acontece no Painel de Vencimentos).
4. **Métricas Redes diz "últimos 30 dias", mas calcula o mês atual** (do dia 1 ao último dia). E a cobertura mede os dias com ação que estão negociados, não os dias do mês cobertos por ações.
5. **A diretoria não cria encartes por padrão.** O botão "+ Nova Ação" só aparece para quem tem a permissão "Criar nova ação" (por padrão, supervisor e administrador); pode ser liberado à diretoria na tela Permissões.
6. **Performance ignora ações longas**: uma ação que começa antes e termina depois do período comparado não entra no cálculo; só entram as que começam ou terminam dentro dele.
7. **Rede Esigma nunca tem última compra**, mesmo quando o cliente existe no Lacteus.
8. **O PDF imprime só o preço de oferta** e não marca as ações negociadas com ✓, embora a legenda das telas use esse símbolo.
9. **O sellout aparece como "unidades"** no detalhe da solicitação, mas é informado em R$ nos formulários.
10. **O botão "Cancelar solicitação"** aparece para qualquer usuário; só quem criou (ou o administrador) consegue concluir.
11. **Duas fórmulas de "sugerir sellout"**: nas solicitações por loja, a sugestão mantém na oferta a mesma margem do PDV; nos encartes, a sugestão é proporcional à diferença entre PDV e oferta. Os valores sugeridos são diferentes para os mesmos números.
12. **Todo usuário enxerga os selos de ação ativa de todas as lojas**, inclusive de lojas fora da sua carteira.
13. **Operacional (resolvido em 02/10/2026)**: a atualização automática do estoque ficou parada de 25/09 a 02/10 por um problema de rede no servidor; nesse período o Painel e a tela Lojas mostraram o retrato de 25/09. A janela "Detalhes da contagem" mostra a data da última sincronização para esse tipo de situação ficar visível.
