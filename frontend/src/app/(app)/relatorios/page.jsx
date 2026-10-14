"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useState } from "react";
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
import { IcoFileText, IcoUpload } from "@/components/Icons";

function Capa({ relatorio }) {
  const { url, erro } = useImagem(relatorio.id, 0);
  return (
    <div className="aspect-[1.35/1] w-full overflow-hidden border-b border-neutral-100 bg-neutral-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Primeira página de ${relatorio.titulo}`} className="h-full w-full object-cover object-top" />
      ) : erro ? (
        <div className="flex h-full items-center justify-center text-neutral-400"><IcoFileText className="h-8 w-8" aria-hidden /></div>
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

  if (!relatorios) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
      </div>
    );
  }

  const gerencia = pode(user, "relatorios.gerenciar");

  return (
    <div className="space-y-4">
      {gerencia && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            {relatorios.length === 0 ? "Nenhum relatório publicado." : `${relatorios.length} ${relatorios.length === 1 ? "relatório publicado" : "relatórios publicados"}.`}
          </p>
          <Link
            href="/admin/relatorios"
            id="btn-importar-relatorio"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-secondary px-4 text-sm font-medium text-white transition hover:bg-secondary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
          >
            <IcoUpload className="h-4 w-4" aria-hidden />
            Importar relatório
          </Link>
        </div>
      )}

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {relatorios.length === 0 ? (
        <Surface>
          <EmptyState
            icon={IcoFileText}
            titulo="Nenhum relatório publicado ainda"
            descricao={gerencia ? "Use o botão Importar relatório acima para enviar o primeiro PDF." : "Quando o administrador importar um relatório, ele aparece aqui."}
          />
        </Surface>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" id="lista-relatorios">
          {relatorios.map((r) => (
            <li key={r.id} data-relatorio={r.id}>
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-secondary/50 hover:shadow-sm">
                <Link href={`/relatorios/${r.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/40">
                  <Capa relatorio={r} />
                  <div className="p-3.5">
                    <h2 className="truncate text-sm font-semibold text-neutral-900">{r.titulo}</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {rotuloReferencia(r.referencia) ? <span className="capitalize">{rotuloReferencia(r.referencia)} · </span> : null}
                      {r.totalPaginas} {r.totalPaginas === 1 ? "página" : "páginas"}
                      {r.publicadoEm ? ` · publicado em ${fmtDataHora(r.publicadoEm).slice(0, 10)}` : ""}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 px-3.5 py-2 text-xs">
                  <button type="button" onClick={() => baixarPdf(r)} className="font-medium text-secondary hover:underline disabled:opacity-50" disabled={baixandoId === r.id} data-acao="baixar">
                    {baixandoId === r.id ? "Gerando PDF…" : "Baixar PDF"}
                  </button>
                  {gerencia && (
                    <>
                      <button type="button" onClick={() => setRenomeando(r)} className="text-secondary hover:underline" data-acao="renomear">Renomear</button>
                      <Link href={`/admin/relatorios?adicionar=${r.id}`} className="text-secondary hover:underline" data-acao="adicionar">Adicionar PDF</Link>
                      <button type="button" onClick={() => excluir(r)} className="ml-auto text-danger hover:underline disabled:opacity-50" disabled={excluindoId === r.id} data-acao="excluir">
                        {excluindoId === r.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
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
