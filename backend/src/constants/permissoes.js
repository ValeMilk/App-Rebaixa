/**
 * RBAC: catalogo de permissoes e o padrao de cada perfil.
 *
 * - O usuario tem um perfil principal (+ perfis adicionais); as permissoes pertencem ao PERFIL.
 * - O PADRAO abaixo reproduz exatamente o acesso que existia antes da tela de permissoes; a matriz
 *   editada pelo administrador fica no banco (PerfilPermissao) e so substitui o padrao do perfil editado.
 * - O perfil admin tem sempre todas as permissoes (nao e editavel): ninguem se tranca para fora.
 * - Permissao decide o que a pessoa pode ABRIR e FAZER. O ALCANCE dos dados (vendedor ve a propria
 *   carteira, supervisor as suas redes, diretoria/admin tudo) continua vindo do perfil principal.
 */
const PERFIS = ["vendedor", "supervisor", "diretoria", "admin"];

const PERFIL_LABEL = { vendedor: "Vendedor", supervisor: "Supervisor", diretoria: "Diretoria", admin: "Admin" };

const GRUPOS = [
  {
    id: "paineis",
    label: "Painéis",
    permissoes: [
      { chave: "painel_vencimentos.ver", label: "Painel de Vencimentos (Dashboard)", descricao: "Estoque em giro e rebaixa de todas as lojas, com detalhes da contagem." },
      { chave: "metricas_redes.ver", label: "Métricas Redes", descricao: "Cobertura de negociação por rede no mês.", naoSeAplica: ["vendedor"] },
      { chave: "acompanhamento_estoque.ver", label: "Acompanhamento de Estoque", descricao: "Painel sobre os retratos de estoque importados das redes." },
    ],
  },
  {
    id: "lojas",
    label: "Lojas e solicitações",
    permissoes: [
      { chave: "lojas.ver", label: "Tela Lojas", descricao: "Produtos próximos ao vencimento por loja e por rede." },
      { chave: "solicitacoes.ver", label: "Tela Solicitações", descricao: "Lista e detalhe dos pedidos de rebaixa e oferta interna." },
      { chave: "solicitacoes.criar", label: "Criar rebaixa ou oferta interna", descricao: "Abrir solicitações a partir das telas Lojas e Painel de Vencimentos." },
      { chave: "solicitacoes.decidir", label: "Aprovar ou rejeitar solicitações", descricao: "O supervisor aprova a primeira etapa; diretoria e admin, a final.", naoSeAplica: ["vendedor"] },
      { chave: "solicitacoes.ver_margens", label: "Ver margens e sellout", descricao: "Mostrar margem PDV, margem da oferta, sellout e valor recebido nas solicitações. O vendedor nunca vê.", naoSeAplica: ["vendedor"] },
    ],
  },
  {
    id: "visao_lojas",
    label: "Estoque, vencimento e ruptura",
    permissoes: [
      { chave: "visao_lojas.ver", label: "Telas Estoque e vencimento e Ruptura", descricao: "Tudo o que cada loja comprou nos últimos 90 dias, com a última contagem, a situação (Ok, Giro, Rebaixa, Não contado, Não reencontrado) e as rupturas. Dados da própria carteira." },
      { chave: "pendencias.receber", label: "Receber pendências de contagem", descricao: "Notificação (no sistema e push) quando uma contagem entra em giro, rebaixa ou ruptura numa loja da carteira." },
      { chave: "pendencias.acompanhar", label: "Acompanhamento das pendências", descricao: "Por vendedor e supervisor: pendências enviadas, vistas e com ação, e as sem ação há mais de 48 horas." },
    ],
  },
  {
    id: "encartes",
    label: "Encartes",
    permissoes: [
      { chave: "encartes.ver", label: "Encartes e Calendário Geral", descricao: "Agenda, detalhe, precificação e PDF. Editar segue a regra do responsável pela rede.", naoSeAplica: ["vendedor"] },
      { chave: "encartes.criar", label: "Criar nova ação", descricao: "Criar encarte ou oferta interna numa rede.", naoSeAplica: ["vendedor"] },
      { chave: "encartes.performance", label: "Performance de encartes", descricao: "Comparação de períodos, margens e sellout." },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    permissoes: [
      { chave: "relatorios.ver", label: "Relatórios Scanntech", descricao: "Ver os relatórios (imagens) importados pelo administrador, como o fechamento mensal de mercado." },
      { chave: "relatorios.ver_todos", label: "Ver os relatórios de cada supervisor", descricao: "Além dos relatórios do comercial, ver os que foram importados para um supervisor específico." },
      { chave: "relatorios.gerenciar", label: "Importar relatórios", descricao: "Enviar um PDF, publicar suas páginas como imagens e excluir relatórios." },
    ],
  },
  {
    id: "agenda",
    label: "Agenda de visitas",
    permissoes: [
      { chave: "agenda_visitas.gerenciar", label: "Montar a própria agenda de visitas", descricao: "Criar, mudar e excluir as visitas da semana (cidade, dia, horário e lojas). Cada usuário só mexe na própria agenda." },
      { chave: "agenda_visitas.ver_todas", label: "Ver a agenda de todos os supervisores", descricao: "Consultar a agenda de visitas de qualquer supervisor, sem poder alterá-la." },
    ],
  },
  {
    id: "integracao",
    label: "Estoque das redes",
    permissoes: [
      { chave: "integracao_estoque.usar", label: "Integração Estoque", descricao: "Importar a planilha de estoque da rede, cadastrar lojas e vincular produtos." },
    ],
  },
  {
    id: "admin",
    label: "Administração",
    permissoes: [
      { chave: "usuarios.gerenciar", label: "Usuários", descricao: "Cadastrar, editar e desativar usuários e definir seus perfis." },
      { chave: "responsaveis_rede.gerenciar", label: "Responsáveis de rede", descricao: "Definir o supervisor responsável por cada rede." },
      { chave: "margens_rede.gerenciar", label: "Margens por rede", descricao: "Margem operacional, margem por categoria, dia limite e modelos de e-mail de cada rede; custo médio por loja e produto." },
      { chave: "custo_medio.anexar", label: "Anexar custo médio da rede", descricao: "Importar a planilha de custo médio de uma rede. Além do admin, só o supervisor responsável pela rede consegue.", naoSeAplica: ["vendedor"] },
      { chave: "redes_infovale.gerenciar", label: "Redes do InfoVale", descricao: "Criar redes para lojas que só existem no Ativmob e definir seus supervisores." },
      { chave: "sincronizacao.executar", label: "Sincronização manual", descricao: "Disparar as sincronizações de estoque, carteira e produtos." },
      { chave: "permissoes.gerenciar", label: "Permissões", descricao: "Editar esta matriz. Exclusiva do perfil Admin.", somenteAdmin: true },
    ],
  },
];

const CATALOGO = GRUPOS.flatMap((g) => g.permissoes.map((p) => ({ ...p, grupo: g.id })));
const CHAVES = CATALOGO.map((p) => p.chave);
const SOMENTE_ADMIN = new Set(CATALOGO.filter((p) => p.somenteAdmin).map((p) => p.chave));
// Permissoes que nao fazem sentido para um perfil (o vendedor nao tem redes nem etapa de aprovacao): por perfil, as chaves que nao se aplicam
const NAO_SE_APLICA = Object.fromEntries(PERFIS.map((perfil) => [perfil, new Set(CATALOGO.filter((p) => (p.naoSeAplica || []).includes(perfil)).map((p) => p.chave))]));

// Acesso de cada perfil ANTES da tela de permissoes (menu + rotas da API).
// (v2.0, 27/10/2026: o supervisor passou a ter a tela Solicitacoes, a decisao da primeira etapa e as margens; a
// diretoria ganhou a tela Solicitacoes; vendedor e supervisor recebem as telas de estoque/ruptura e as pendencias.)
const PADRAO = {
  vendedor: ["lojas.ver", "solicitacoes.ver", "solicitacoes.criar", "visao_lojas.ver", "pendencias.receber"],
  supervisor: ["metricas_redes.ver", "encartes.ver", "encartes.criar", "solicitacoes.ver", "solicitacoes.criar", "solicitacoes.decidir", "solicitacoes.ver_margens", "visao_lojas.ver", "pendencias.receber", "custo_medio.anexar", "relatorios.ver", "agenda_visitas.gerenciar"],
  diretoria: ["metricas_redes.ver", "encartes.ver", "encartes.performance", "solicitacoes.ver", "solicitacoes.criar", "solicitacoes.decidir", "solicitacoes.ver_margens", "visao_lojas.ver", "relatorios.ver", "relatorios.ver_todos", "agenda_visitas.ver_todas"],
  admin: CHAVES,
};

module.exports = { PERFIS, PERFIL_LABEL, GRUPOS, CATALOGO, CHAVES, SOMENTE_ADMIN, NAO_SE_APLICA, PADRAO };
