"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const Ctx = createContext(null);

export function PageTitleProvider({ children }) {
  const [pagina, setPagina] = useState(null);
  const value = useMemo(() => ({ pagina, setPagina }), [pagina]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePaginaTitulo() {
  return useContext(Ctx)?.pagina ?? null;
}

// Cada pagina se anuncia: o titulo aparece na TopBar (desktop) e no header mobile.
export function useTituloDaPagina(titulo, subtitulo) {
  const set = useContext(Ctx)?.setPagina;
  useEffect(() => {
    if (!set) return;
    set({ titulo, subtitulo });
    if (typeof document !== "undefined") document.title = titulo ? `${titulo} · InfoVale` : "InfoVale";
    return () => set(null);
  }, [set, titulo, subtitulo]);
}
