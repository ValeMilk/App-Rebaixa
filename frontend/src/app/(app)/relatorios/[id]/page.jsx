"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useImagem } from "@/lib/relatorios";
import { rotuloReferencia } from "@/lib/pdfParaImagens";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { IcoFileText, IcoX, IcoChevronRight } from "@/components/Icons";

// Uma pagina: baixa so quando chega perto da tela; o espaco ja vem na proporcao certa
function Pagina({ relatorioId, pagina, total, onAmpliar }) {
  const ref = useRef(null);
  const [perto, setPerto] = useState(false);
  const { url, erro } = useImagem(relatorioId, pagina.numero, perto);

  useEffect(() => {
    const el = ref.current;
    if (!el || perto) return undefined;
    if (typeof IntersectionObserver === "undefined") { setPerto(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setPerto(true); io.disconnect(); } }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [perto]);

  const proporcao = pagina.largura && pagina.altura ? `${pagina.largura} / ${pagina.altura}` : "1.41 / 1";

  return (
    <section ref={ref} id={`pagina-${pagina.numero}`} className="scroll-mt-20" data-pagina={pagina.numero}>
      <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-500">
        <span>Página {pagina.numero} de {total}</span>
        <button type="button" className="text-secondary hover:underline" onClick={() => onAmpliar(pagina.numero)}>Ampliar</button>
      </div>
      <button
        type="button"
        onClick={() => onAmpliar(pagina.numero)}
        className="block w-full overflow-hidden rounded-xl border border-neutral-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
        style={{ aspectRatio: proporcao }}
        aria-label={`Ampliar a página ${pagina.numero}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Página ${pagina.numero} de ${total}`} className="block h-full w-full object-contain" />
        ) : erro ? (
          <span className="flex h-full items-center justify-center text-sm text-neutral-500">Não foi possível carregar esta página.</span>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </button>
    </section>
  );
}

// Ampliacao em TELA CHEIA: cobre a janela inteira (e pede a tela cheia do navegador, quando ha suporte).
// Ajustada a tela por padrao; clicar na imagem alterna para o tamanho real, com rolagem.
function Ampliacao({ relatorio, numero, onFechar, onTrocar }) {
  const total = relatorio.paginas.length;
  const pagina = relatorio.paginas.find((p) => p.numero === numero);
  const { url, erro } = useImagem(relatorio.id, numero);
  const [real, setReal] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [suportaCheia, setSuportaCheia] = useState(false);
  const raiz = useRef(null);

  // Ao abrir: pede a tela cheia do navegador (iPhone nao suporta; entao so cobre a janela), trava a rolagem
  // da pagina de tras e, ao fechar, sai da tela cheia.
  useEffect(() => {
    const el = raiz.current;
    setSuportaCheia(!!document.fullscreenEnabled);
    try { el?.requestFullscreen?.()?.catch?.(() => {}); } catch { /* sem tela cheia do navegador */ }
    const aoMudar = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", aoMudar);
      document.body.style.overflow = overflow;
      try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {}); } catch { /* ja saiu */ }
    };
  }, []);

  useEffect(() => { setReal(false); }, [numero]);

  useEffect(() => {
    function tecla(e) {
      if (e.key === "ArrowRight" && numero < total) onTrocar(numero + 1);
      else if (e.key === "ArrowLeft" && numero > 1) onTrocar(numero - 1);
      else if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [numero, total, onTrocar, onFechar]);

  function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
      else raiz.current?.requestFullscreen?.()?.catch?.(() => {});
    } catch { /* sem suporte */ }
  }

  const botao = "inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div ref={raiz} id="ampliacao" role="dialog" aria-modal="true" aria-label={`Página ${numero} de ${relatorio.titulo}`} className="fixed inset-0 z-[60] flex flex-col bg-neutral-900 animate-fade-in">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className={`${botao} w-9 px-0`} onClick={() => onTrocar(numero - 1)} disabled={numero <= 1} aria-label="Página anterior">
            <IcoChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <span className="min-w-[92px] text-center text-sm font-medium text-white" id="ampliacao-numero">Página {numero} de {total}</span>
          <button type="button" className={`${botao} w-9 px-0`} onClick={() => onTrocar(numero + 1)} disabled={numero >= total} aria-label="Próxima página">
            <IcoChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 hidden truncate text-sm text-white/60 md:inline">{relatorio.titulo}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={botao} onClick={() => setReal((v) => !v)} id="btn-tamanho">{real ? "Ajustar à tela" : "Tamanho real"}</button>
          {suportaCheia && (
            <button type="button" className={botao} onClick={alternarTelaCheia} id="btn-tela-cheia">{cheia ? "Sair da tela cheia" : "Tela cheia"}</button>
          )}
          {url && (
            <a href={url} download={`${relatorio.titulo.replace(/[\\/:*?"<>|]+/g, "-")} - pagina ${numero}.png`} className={botao}>
              Baixar
            </a>
          )}
          <button type="button" className={`${botao} w-9 px-0`} onClick={onFechar} aria-label="Fechar" id="btn-fechar-ampliacao"><IcoX className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" id="ampliacao-corpo">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Página ${numero} de ${total}`}
            onClick={() => setReal((v) => !v)}
            className={real ? "mx-auto block max-w-none bg-white cursor-zoom-out" : "block h-full w-full cursor-zoom-in object-contain"}
            style={real ? { width: pagina?.largura || "auto" } : undefined}
          />
        ) : erro ? (
          <p className="p-10 text-center text-sm text-white/70">Não foi possível carregar esta página.</p>
        ) : (
          <div className="flex h-full items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" /></div>
        )}
      </div>
    </div>
  );
}

export default function RelatorioPage() {
  const { id } = useParams();
  const [relatorio, setRelatorio] = useState(null);
  const [erro, setErro] = useState("");
  const [ampliada, setAmpliada] = useState(null);

  useTituloDaPagina(relatorio ? relatorio.titulo : "Relatório", relatorio ? rotuloReferencia(relatorio.referencia) || undefined : undefined);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get(`/relatorios/${id}`);
        setRelatorio(data.relatorio);
      } catch (err) {
        setErro(err?.response?.status === 404 ? "Relatório não encontrado." : err?.response?.data?.error || "Não foi possível carregar o relatório.");
      }
    })();
  }, [id]);

  const trocar = useCallback((n) => setAmpliada(n), []);

  if (erro) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white">
        <EmptyState icon={IcoFileText} titulo={erro} acao={<Link href="/relatorios"><Button variant="outline" size="sm">Voltar aos relatórios</Button></Link>} />
      </div>
    );
  }
  if (!relatorio) {
    return <div className="mx-auto w-full max-w-5xl space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-[480px] w-full" /></div>;
  }

  const total = relatorio.paginas.length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/relatorios" className="text-xs text-secondary hover:underline">← Todos os relatórios</Link>
          <h2 className="truncate text-lg font-semibold text-neutral-900">{relatorio.titulo}</h2>
        </div>
        {total > 1 && (
          <nav className="flex flex-wrap items-center gap-1" aria-label="Ir para a página">
            {relatorio.paginas.map((p) => (
              <a
                key={p.numero}
                href={`#pagina-${p.numero}`}
                className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 hover:border-secondary/50 hover:text-secondary"
              >
                {p.numero}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="space-y-6" id="paginas">
        {relatorio.paginas.map((p) => (
          <Pagina key={p.numero} relatorioId={relatorio.id} pagina={p} total={total} onAmpliar={setAmpliada} />
        ))}
      </div>

      {ampliada && <Ampliacao relatorio={relatorio} numero={ampliada} onFechar={() => setAmpliada(null)} onTrocar={trocar} />}
    </div>
  );
}
