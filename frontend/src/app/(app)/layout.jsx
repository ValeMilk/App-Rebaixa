"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { navVisivel, hrefAtivo, itensBarraInferior, permissaoDaRota, rotaInicial } from "@/lib/nav";
import { pode } from "@/lib/permissoes";
import { PageTitleProvider } from "@/components/PageTitleContext";
import Sidebar from "@/components/shell/Sidebar";
import TopBar from "@/components/shell/TopBar";
import MobileHeader from "@/components/shell/MobileHeader";
import BottomBar from "@/components/shell/BottomBar";
import NavSheet from "@/components/shell/NavSheet";
import AtivarPushBanner from "@/components/pendencias/AtivarPushBanner";

const CHAVE_SIDEBAR = "iv.sidebar";
const INTERVALO_CONTADOR_MS = 60000;

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, init, loading, logout, refresh } = useAuth();
  const syncedRef = useRef(false);
  const permissoesEm = useRef(0);
  const [conferidas, setConferidas] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [naoVistas, setNaoVistas] = useState(0);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!loading && !token) router.replace("/login"); }, [loading, token, router]);

  // Preferencia de sidebar recolhida: lida depois de montar (evita hydration mismatch)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(CHAVE_SIDEBAR) === "collapsed"); } catch {}
  }, []);
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  useEffect(() => {
    if (user && token && !syncedRef.current) {
      syncedRef.current = true;
      api.post("/sync/trigger").catch(() => {});
    }
  }, [user, token]);

  // Permissoes do perfil: recarrega ao abrir o app e ao voltar para a aba (no maximo 1x por minuto),
  // para valer o que o admin mudou. Sessao antiga, sem permissoes guardadas, espera a resposta.
  useEffect(() => {
    if (loading || !token) return;
    function atualizar() {
      if (document.visibilityState !== "visible" || Date.now() - permissoesEm.current < 60000) return;
      permissoesEm.current = Date.now();
      refresh()
        .catch(() => {
          permissoesEm.current = 0;
          if (!useAuth.getState().user?.permissoes) logout();
        })
        .finally(() => setConferidas(true));
    }
    atualizar();
    document.addEventListener("visibilitychange", atualizar);
    return () => document.removeEventListener("visibilitychange", atualizar);
  }, [loading, token, refresh, logout]);

  // Contador de pendencias nao vistas (bolinha no menu): ao abrir, a cada 60 s e ao voltar para a aba.
  // So para quem recebe pendencias; pausa com a aba escondida.
  const recebePendencias = pode(user, "pendencias.receber");
  useEffect(() => {
    if (!token || !recebePendencias) { setNaoVistas(0); return; }
    let vivo = true;
    let timer = null;
    const buscar = () => {
      if (document.visibilityState !== "visible") return;
      api.get("/pendencias/contador").then(({ data }) => { if (vivo) setNaoVistas(Number(data?.naoVistas) || 0); }).catch(() => {});
    };
    buscar();
    timer = setInterval(buscar, INTERVALO_CONTADOR_MS);
    document.addEventListener("visibilitychange", buscar);
    return () => { vivo = false; clearInterval(timer); document.removeEventListener("visibilitychange", buscar); };
  }, [token, recebePendencias, pathname]);

  // Guarda de rota (RBAC): sem a permissao da tela, vai para a tela inicial do usuario
  // (so depois da primeira conferencia com o servidor, para nao barrar com permissoes velhas do navegador)
  const permissoesProntas = conferidas && !!user?.permissoes;
  const exigida = permissaoDaRota(pathname);
  const liberada = !exigida || pode(user, exigida);
  useEffect(() => {
    if (permissoesProntas && !liberada) router.replace(rotaInicial(user) || "/sem-acesso");
  }, [permissoesProntas, liberada, user, router]);

  function toggleCollapse() {
    setCollapsed((c) => {
      const novo = !c;
      try { localStorage.setItem(CHAVE_SIDEBAR, novo ? "collapsed" : "expanded"); } catch {}
      return novo;
    });
  }

  if (loading || !user || !permissoesProntas || !liberada) {
    return (
      <div className="flex h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-secondary" />
          <p className="text-sm text-neutral-500">Carregando...</p>
        </div>
      </div>
    );
  }

  const itens = navVisivel(user);
  const ativo = hrefAtivo(itens, pathname);
  const badges = naoVistas > 0 ? { "/pendencias": naoVistas } : {};
  const itensBarra = itensBarraInferior(itens);
  // Pendencias fora dos 3 primeiros da barra inferior: a bolinha vai para o botao Menu
  const badgeMenu = naoVistas > 0 && !itensBarra.some((n) => n.href === "/pendencias") ? naoVistas : 0;

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen w-full max-w-full overflow-x-clip bg-page">
        <Sidebar
          className="hidden lg:flex"
          user={user}
          itens={itens}
          ativo={ativo}
          badges={badges}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          onLogout={logout}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar className="hidden lg:flex" collapsed={collapsed} onToggle={toggleCollapse} />
          <MobileHeader user={user} onMenu={() => setSheetOpen(true)} />
          {recebePendencias && pathname !== "/pendencias" && <AtivarPushBanner compacto />}

          <main className="min-w-0 flex-1 px-4 py-4 pb-24 md:px-6 lg:px-8 lg:py-6 lg:pb-16">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-6">{children}</div>
          </main>

          <footer className="hidden border-t border-white/40 px-8 py-6 text-center text-xs text-neutral-600 lg:block">
            InfoVale · Valemilk © {new Date().getFullYear()}
          </footer>

          <BottomBar itens={itensBarra} ativo={ativo} badges={badges} badgeMenu={badgeMenu} onMenu={() => setSheetOpen(true)} />
        </div>
      </div>

      <NavSheet open={sheetOpen} onClose={() => setSheetOpen(false)} user={user} itens={itens} ativo={ativo} badges={badges} onLogout={logout} />
    </PageTitleProvider>
  );
}
