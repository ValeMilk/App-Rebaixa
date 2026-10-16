"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { useImagem, baixarRelatorioPdf } from "@/lib/relatorios";
import { rotuloReferencia } from "@/lib/pdfParaImagens";
import { fmtDataHora } from "@/lib/utils";
import EditarRelatorioDialog from "@/components/relatorios/EditarRelatorioDialog";
import Surface from "@/components/ui/Surface";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { IcoFileText, IcoUpload, IcoSearch } from "@/components/Icons";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Miniatura da capa: so baixa quando a linha chega perto da tela (a lista pode ter muitos relatorios)
function MiniCapa({ relatorio }) {
  const ref = useRef(null);
  const [perto, setPerto] = useState(false);
  const { url, erro } = useImagem(relatorio.id, 0, perto);

  useEffect(() => {
    const el = ref.current;
    if (!el || perto) return undefined;
    if (typeof IntersectionObserver === "undefined") { setPerto(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setPerto(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [perto]);

  return (
    <div ref={ref} className="h-11 w-16 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover object-top" />
      ) : erro ? (
        <div className="flex h-full items-center justify-center text-neutral-400"><IcoFileText className="h-4 w-4" aria-hidden /></div>
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </div>
  );
}

export default function RelatoriosPage() {
  useTituloDaPagina("Relatórios Scanntech", "Fechamentos e análises importados pela equipe");
  const { user } = useAuth();
  const [relatorios, setRelatorios] = useState(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [renomeando, setRenomeando] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [baixandoId, setBaixandoId] = useState(null);

  async function baixarPdf(r) {
    setErro("");
    setAviso("");
    setBaixandoId(r.id);
    try {
      await baixarRelatorioPdf(r.id, r.titulo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBaixandoId(null);
    }
  }

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get("/relatorios");
      setRelatorios(data.relatorios || []);
    } catch (err) {
      setErro(err?.response?.data?.error || "Não foi possível carregar os relatórios.");
      setRelatorios([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(r) {
    const paginas = `${r.totalPaginas} ${r.totalPaginas === 1 ? "página" : "páginas"}`;
    if (!confirm(`Excluir o relatório “${r.titulo}” (${paginas})?\n\nEle deixa de aparecer para todos os usuários e não dá para desfazer.`)) return;
    setErro("");
    setAviso("");
    setExcluindoId(r.id);
    try {
      await api.delete(`/relatorios/${r.id}`);
      setAviso(`Relatório “${r.titulo}” excluído.`);
      await carregar();
    } catch (err) {
      setErro(err?.response?.data?.error || "Não foi possível excluir o relatório.");
    } finally {
      setExcluindoId(null);
    }
  }

  // Filtra pela busca e agrupa por mes de referencia (a ordem ja vem do mais recente para o mais antigo)
  const grupos = useMemo(() => {
    const q = semAcento(busca.trim());
    const mapa = new Map();
    for (const r of relatorios || []) {
      if (q && !semAcento(`${r.titulo} ${rotuloReferencia(r.referencia)}`).includes(q)) continue;
      const chave = r.referencia || "";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(r);
    }
    return [...mapa.entries()].map(([chave, itens]) => ({ chave, rotulo: rotuloReferencia(chave) || "Sem mês de referência", itens }));
  }, [relatorios, busca]);

  if (!relatorios) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const gerencia = pode(user, "relatorios.gerenciar");
  const total = relatorios.length;
  const exibidos = grupos.reduce((n, g) => n + g.itens.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {total > 0 && (
          <div className="relative w-full sm:w-72">
            <IcoSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
            <input className="input pl-9" placeholder="Buscar relatório" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar relatório" id="busca-relatorios" />
          </div>
        )}
        <p className="text-sm text-neutral-600" id="contagem-relatorios">
          {total === 0
            ? "Nenhum relatório publicado."
            : busca.trim()
              ? `${exibidos} de ${total} ${total === 1 ? "relatório" : "relatórios"}`
              : `${total} ${total === 1 ? "relatório publicado" : "relatórios publicados"}`}
        </p>
        {gerencia && (
          <Link
            href="/admin/relatorios"
            id="btn-importar-relatorio"
            className="ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-secondary px-4 text-sm font-medium text-white transition hover:bg-secondary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
          >
            <IcoUpload className="h-4 w-4" aria-hidden />
            Importar relatório
          </Link>
        )}
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {total === 0 ? (
        <Surface>
          <EmptyState
            icon={IcoFileText}
            titulo="Nenhum relatório publicado ainda"
            descricao={gerencia ? "Use o botão Importar relatório acima para enviar o primeiro PDF." : "Quando o administrador importar um relatório, ele aparece aqui."}
          />
        </Surface>
      ) : exibidos === 0 ? (
        <Surface>
          <EmptyState
            icon={IcoSearch}
            titulo={`Nenhum relatório encontrado para “${busca.trim()}”`}
            acao={<button type="button" className="text-sm text-secondary hover:underline" onClick={() => setBusca("")}>Limpar a busca</button>}
          />
        </Surface>
      ) : (
        <div className="space-y-5" id="lista-relatorios">
          {grupos.map((g) => (
            <section key={g.chave || "sem-mes"} data-grupo={g.chave || "sem-mes"}>
              <h2 className="mb-1.5 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <span>{g.rotulo}</span>
                <span className="font-normal normal-case text-neutral-400">{g.itens.length} {g.itens.length === 1 ? "relatório" : "relatórios"}</span>
              </h2>
              <Surface className="overflow-hidden">
                <ul className="divide-y divide-neutral-100">
                  {g.itens.map((r) => (
                    <li key={r.id} data-relatorio={r.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                      <Link
                        href={`/relatorios/${r.id}`}
                        className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
                        data-abrir
                      >
                        <MiniCapa relatorio={r} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-neutral-900" data-titulo>{r.titulo}</span>
                          <span className="block truncate text-xs text-neutral-500">
                            {r.totalPaginas} {r.totalPaginas === 1 ? "página" : "páginas"}
                            {r.publicadoEm ? ` · publicado em ${fmtDataHora(r.publicadoEm).slice(0, 10)}` : ""}
                          </span>
                        </span>
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <button type="button" onClick={() => baixarPdf(r)} className="font-medium text-secondary hover:underline disabled:opacity-50" disabled={baixandoId === r.id} data-acao="baixar">
                          {baixandoId === r.id ? "Gerando PDF…" : "Baixar PDF"}
                        </button>
                        {gerencia && (
                          <>
                            <button type="button" onClick={() => setRenomeando(r)} className="text-secondary hover:underline" data-acao="renomear">Renomear</button>
                            <Link href={`/admin/relatorios?adicionar=${r.id}`} className="text-secondary hover:underline" data-acao="adicionar">Adicionar PDF</Link>
                            <button type="button" onClick={() => excluir(r)} className="text-danger hover:underline disabled:opacity-50" disabled={excluindoId === r.id} data-acao="excluir">
                              {excluindoId === r.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Surface>
            </section>
          ))}
        </div>
      )}

      {renomeando && (
        <EditarRelatorioDialog
          relatorio={renomeando}
          onClose={() => setRenomeando(null)}
          onSalvo={() => { setRenomeando(null); setAviso("Relatório renomeado."); carregar(); }}
        />
      )}
    </div>
  );
}
