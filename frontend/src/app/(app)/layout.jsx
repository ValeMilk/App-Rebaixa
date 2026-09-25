"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { navVisivel, hrefAtivo, itensBarraInferior } from "@/lib/nav";
import { PageTitleProvider } from "@/components/PageTitleContext";
import Sidebar from "@/components/shell/Sidebar";
import TopBar from "@/components/shell/TopBar";
import MobileHeader from "@/components/shell/MobileHeader";
import BottomBar from "@/components/shell/BottomBar";
import NavSheet from "@/components/shell/NavSheet";

const CHAVE_SIDEBAR = "iv.sidebar";

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, init, loading, logout } = useAuth();
  const syncedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  function toggleCollapse() {
    setCollapsed((c) => {
      const novo = !c;
      try { localStorage.setItem(CHAVE_SIDEBAR, novo ? "collapsed" : "expanded"); } catch {}
      return novo;
    });
  }

  if (loading || !user) {
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

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen w-full max-w-full overflow-x-clip bg-page">
        <Sidebar
          className="hidden lg:flex"
          user={user}
          itens={itens}
          ativo={ativo}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          onLogout={logout}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar className="hidden lg:flex" collapsed={collapsed} onToggle={toggleCollapse} />
          <MobileHeader user={user} onMenu={() => setSheetOpen(true)} />

          <main className="min-w-0 flex-1 px-4 py-4 pb-24 md:px-6 lg:px-8 lg:py-6 lg:pb-16">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-6">{children}</div>
          </main>

          <footer className="hidden border-t border-white/40 px-8 py-6 text-center text-xs text-neutral-600 lg:block">
            InfoVale · Valemilk © {new Date().getFullYear()}
          </footer>

          <BottomBar itens={itensBarraInferior(itens)} ativo={ativo} onMenu={() => setSheetOpen(true)} />
        </div>
      </div>

      <NavSheet open={sheetOpen} onClose={() => setSheetOpen(false)} user={user} itens={itens} ativo={ativo} onLogout={logout} />
    </PageTitleProvider>
  );
}
