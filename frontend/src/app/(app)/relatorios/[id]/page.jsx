"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useImagem } from "@/lib/relatorios";
import { rotuloReferencia } from "@/lib/pdfParaImagens";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
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

// Ampliacao: tamanho real com rolagem, anterior/proxima e download
function Ampliacao({ relatorio, numero, onFechar, onTrocar }) {
  const total = relatorio.paginas.length;
  const pagina = relatorio.paginas.find((p) => p.numero === numero);
  const { url, erro } = useImagem(relatorio.id, numero);
  const [real, setReal] = useState(false);

  useEffect(() => {
    function tecla(e) {
      if (e.key === "ArrowRight" && numero < total) onTrocar(numero + 1);
      if (e.key === "ArrowLeft" && numero > 1) onTrocar(numero - 1);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [numero, total, onTrocar]);

  return (
    <Dialog open onClose={onFechar} sheet size="xl" ariaLabel={`Página ${numero} de ${relatorio.titulo}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onTrocar(numero - 1)} disabled={numero <= 1} aria-label="Página anterior">
            <IcoChevronRight className="h-4 w-4 rotate-180" />
          </Button>
          <span className="min-w-[88px] text-center text-sm font-medium text-neutral-800" id="ampliacao-numero">Página {numero} de {total}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => onTrocar(numero + 1)} disabled={numero >= total} aria-label="Próxima página">
            <IcoChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setReal((v) => !v)} id="btn-tamanho">{real ? "Ajustar à tela" : "Tamanho real"}</Button>
          {url && (
            <a href={url} download={`${relatorio.titulo.replace(/[\\/:*?"<>|]+/g, "-")} - pagina ${numero}.png`} className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-neutral-700 hover:bg-accent hover:text-primary">
              Baixar
            </a>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onFechar} aria-label="Fechar"><IcoX className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-2" id="ampliacao-corpo">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Página ${numero} de ${total}`}
            className="mx-auto block bg-white"
            style={real ? { maxWidth: "none", width: pagina?.largura || "auto" } : { maxWidth: "100%", height: "auto" }}
          />
        ) : erro ? (
          <p className="p-6 text-center text-sm text-neutral-500">Não foi possível carregar esta página.</p>
        ) : (
          <Skeleton className="mx-auto h-[60vh] w-full max-w-3xl" />
        )}
      </div>
    </Dialog>
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
