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
const PADRAO = {
  vendedor: ["lojas.ver", "solicitacoes.ver", "solicitacoes.criar"],
  supervisor: ["metricas_redes.ver", "encartes.ver", "encartes.criar", "solicitacoes.criar"],
  diretoria: ["metricas_redes.ver", "encartes.ver", "encartes.performance", "solicitacoes.criar", "solicitacoes.decidir"],
  admin: CHAVES,
};

module.exports = { PERFIS, PERFIL_LABEL, GRUPOS, CATALOGO, CHAVES, SOMENTE_ADMIN, NAO_SE_APLICA, PADRAO };
