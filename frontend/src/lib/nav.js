import { IcoGrid, IcoStore, IcoClipboard, IcoTag, IcoCalendar, IcoChart, IcoUsers, IcoSync, IcoUpload, IcoPackage, IcoLock } from "@/components/Icons";
import { pode } from "@/lib/permissoes";

// Lista UNICA de navegacao: sidebar, sheet mobile e barra inferior leem daqui.
// `short` e o rotulo curto da barra inferior; `perm` e a permissao (RBAC) que libera o item e a rota.
export const NAV = [
  { href: "/dashboard",            label: "Dashboard",        short: "Painel",    Icon: IcoGrid,      perm: "painel_vencimentos.ver", group: "principal" },
  { href: "/dashboard/supervisor", label: "Métricas Redes",   short: "Métricas",  Icon: IcoChart,     perm: "metricas_redes.ver", group: "principal" },
  { href: "/estoque",              label: "Lojas",            short: "Lojas",     Icon: IcoStore,     perm: "lojas.ver", group: "principal" },
  { href: "/solicitacoes",         label: "Solicitações",     short: "Pedidos",   Icon: IcoClipboard, perm: "solicitacoes.ver", group: "principal" },
  { href: "/encartes",             label: "Encartes",         short: "Encartes",  Icon: IcoTag,       perm: "encartes.ver", group: "principal" },
  { href: "/encartes/calendario",  label: "Calendário Geral", short: "Cal. Geral", Icon: IcoCalendar, perm: "encartes.ver", group: "principal" },
  { href: "/encartes/performance", label: "Performance",      short: "Performance", Icon: IcoChart,   perm: "encartes.performance", group: "principal" },
  { href: "/acompanhamento-estoque", label: "Acompanhamento Estoque", short: "Acomp. Estoque", Icon: IcoPackage, perm: "acompanhamento_estoque.ver", group: "principal" },
  { href: "/integracao-estoque",  label: "Integração Estoque", short: "Integração", Icon: IcoUpload,  perm: "integracao_estoque.usar", group: "principal" },
  { href: "/admin/usuarios",         label: "Usuários",       short: "Usuários",  Icon: IcoUsers,     perm: "usuarios.gerenciar", group: "admin" },
  { href: "/admin/responsabilidades", label: "Resp. Rede",    short: "Resp. Rede", Icon: IcoUsers,    perm: "responsaveis_rede.gerenciar", group: "admin" },
  { href: "/admin/redes",            label: "Redes InfoVale", short: "Redes",     Icon: IcoStore,     perm: "redes_infovale.gerenciar", group: "admin" },
  { href: "/admin/sync",             label: "Sincronização",  short: "Sync",      Icon: IcoSync,      perm: "sincronizacao.executar", group: "admin" },
  { href: "/admin/permissoes",       label: "Permissões",     short: "Permissões", Icon: IcoLock,     perm: "permissoes.gerenciar", group: "admin" },
];

export const GRUPOS = [
  { id: "principal", label: "Principal" },
  { id: "admin", label: "Administração" },
];

export function navVisivel(user) {
  return NAV.filter((n) => pode(user, n.perm));
}

// Permissao exigida pela rota (a do item de menu mais especifico que a contem); null = rota livre.
export function permissaoDaRota(pathname) {
  const href = hrefAtivo(NAV, pathname);
  return href ? NAV.find((n) => n.href === href).perm : null;
}

// Tela inicial: a de costume do perfil, se liberada; senao a primeira do menu; null = sem nenhuma tela.
const INICIO_DO_PERFIL = { admin: "/dashboard", supervisor: "/dashboard/supervisor", vendedor: "/estoque", diretoria: "/encartes" };
export function rotaInicial(user) {
  const itens = navVisivel(user);
  const preferida = INICIO_DO_PERFIL[user?.role];
  if (itens.some((n) => n.href === preferida)) return preferida;
  return itens[0]?.href || null;
}

// Item ativo = o href mais especifico que casa com a rota (evita "Encartes" e
// "Calendário Geral" acesos ao mesmo tempo em /encartes/calendario).
export function hrefAtivo(itens, pathname) {
  let melhor = null;
  for (const n of itens) {
    if (pathname === n.href || pathname.startsWith(n.href + "/")) {
      if (!melhor || n.href.length > melhor.length) melhor = n.href;
    }
  }
  return melhor;
}

// Barra inferior: 3 primeiros destinos + "Menu" (que abre a navegacao completa).
export function itensBarraInferior(itens) {
  return itens.slice(0, 3);
}
