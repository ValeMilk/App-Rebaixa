import { IcoGrid, IcoStore, IcoClipboard, IcoTag, IcoCalendar, IcoChart, IcoUsers, IcoSync } from "@/components/Icons";

// Lista UNICA de navegacao: sidebar, sheet mobile e barra inferior leem daqui.
// `short` e o rotulo curto da barra inferior; `roles` decide quem ve o item.
export const NAV = [
  { href: "/dashboard",            label: "Dashboard",        short: "Painel",    Icon: IcoGrid,      roles: ["admin"],                              group: "principal" },
  { href: "/dashboard/supervisor", label: "Métricas Redes",   short: "Métricas",  Icon: IcoChart,     roles: ["supervisor", "diretoria", "admin"],   group: "principal" },
  { href: "/estoque",              label: "Lojas",            short: "Lojas",     Icon: IcoStore,     roles: ["vendedor", "admin"],                  group: "principal" },
  { href: "/solicitacoes",         label: "Solicitações",     short: "Pedidos",   Icon: IcoClipboard, roles: ["vendedor", "admin"],                  group: "principal" },
  { href: "/encartes",             label: "Encartes",         short: "Encartes",  Icon: IcoTag,       roles: ["supervisor", "diretoria", "admin"],   group: "principal" },
  { href: "/encartes/calendario",  label: "Calendário Geral", short: "Cal. Geral", Icon: IcoCalendar, roles: ["supervisor", "diretoria", "admin"],   group: "principal" },
  { href: "/encartes/performance", label: "Performance",      short: "Performance", Icon: IcoChart,   roles: ["diretoria", "admin"],                 group: "principal" },
  { href: "/admin/usuarios",         label: "Usuários",       short: "Usuários",  Icon: IcoUsers,     roles: ["admin"],                              group: "admin" },
  { href: "/admin/responsabilidades", label: "Resp. Rede",    short: "Resp. Rede", Icon: IcoUsers,    roles: ["admin"],                              group: "admin" },
  { href: "/admin/sync",             label: "Sincronização",  short: "Sync",      Icon: IcoSync,      roles: ["admin"],                              group: "admin" },
];

export const GRUPOS = [
  { id: "principal", label: "Principal" },
  { id: "admin", label: "Administração" },
];

export function rolesEfetivas(user) {
  return [user.role, ...(user.roles || [])];
}

export function navVisivel(user) {
  const roles = rolesEfetivas(user);
  return NAV.filter((n) => n.roles.some((r) => roles.includes(r)));
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
