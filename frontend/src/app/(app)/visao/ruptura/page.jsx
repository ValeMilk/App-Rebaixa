"use client";

import { useCallback, useEffect, useState } from "react";
import { useTituloDaPagina } from "@/components/PageTitleContext";
import api from "@/lib/api";
import { fmtDataHoraCurta, fmtDataHora } from "@/lib/utils";
import { IcoBoxOff, IcoAlert, IcoX, IcoCheck, IcoUser } from "@/components/Icons";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import LojaCard from "@/components/visao/LojaCard";

const nomeAgente = (s) => (s ? String(s).toLowerCase() : "");

/** Dialogo pequeno: confirma o pedido de reposicao com observacao opcional. */
function PedidoFeitoDialog({ ruptura, onClose, onFeito }) {
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const { data } = await api.post(`/visao/rupturas/${ruptura._id}/pedido-feito`, { observacao: observacao.trim() || undefined });
      onFeito(data.ruptura);
      onClose();
    } catch (err) {
      if (err?.response?.status === 409 && err.response.data?.pedidoFeito) {
        onFeito({ ...ruptura, pedidoFeito: err.response.data.pedidoFeito });
        onClose();
        return;
      }
      setErro(err?.response?.data?.error || "Não foi possível registrar o pedido. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} size="sm" ariaLabel="Marcar pedido feito">
      <form onSubmit={confirmar}>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Pedido de reposição</div>
            <h2 className="text-base font-semibold leading-snug text-neutral-900">{ruptura.produto || ruptura.produtoCodigo}</h2>
            <p className="mt-0.5 truncate text-sm text-neutral-600">{ruptura.cliente}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200">
            <IcoX className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-neutral-600">Confirme que você fez o pedido de reposição deste item para a loja.</p>
          <div>
            <label htmlFor="obs-pedido" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Observação (opcional)</label>
            <textarea
              id="obs-pedido"
              className="input min-h-[72px]"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={500}
              placeholder="Ex.: pedido 1234, entrega na sexta"
            />
          </div>
          {erro && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <IcoAlert className="h-4 w-4 shrink-0" aria-hidden />{erro}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3 safe-area-pb">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="submit" disabled={enviando}>{enviando ? "Gravando..." : "Marcar pedido feito"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RupturaItem({ r, onMarcar }) {
  const feito = r.pedidoFeito && r.pedidoFeito.em;
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <IcoBoxOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-neutral-800">{r.produto || r.produtoCodigo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <Badge tone="danger">Ruptura</Badge>
            <span className="inline-flex items-center gap-1 whitespace-nowrap capitalize">
              <IcoUser className="h-3 w-3" aria-hidden />{nomeAgente(r.contadoPor) || "não identificado"} · {fmtDataHoraCurta(r.contadoEm)}
            </span>
          </div>
          {feito && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-success">
              <IcoCheck className="h-3.5 w-3.5" aria-hidden />
              Pedido feito por {r.pedidoFeito.porNome || "—"} em {fmtDataHora(r.pedidoFeito.em).replace(/:\d{2}$/, "")}
              {r.pedidoFeito.observacao && <span className="font-normal text-neutral-500"> · {r.pedidoFeito.observacao}</span>}
            </div>
          )}
        </div>
      </div>
      {!feito && (
        <button
          type="button"
          onClick={() => onMarcar(r)}
          className="mt-2.5 w-full rounded-xl border border-secondary/30 bg-white py-2 text-sm font-semibold text-secondary transition hover:bg-secondary/5 active:scale-[0.98]"
        >
          Marcar pedido feito
        </button>
      )}
    </div>
  );
}

export default function VisaoRupturaPage() {
  useTituloDaPagina("Ruptura", "Itens contados com zero e ruptura marcada pelo promotor");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [alvo, setAlvo] = useState(null);
  const [toast, setToast] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const { data } = await api.get("/visao/rupturas");
      setDados(data);
      setExpanded(new Set((data.lojas || []).slice(0, 10).map((l) => l.clienteCodigo)));
    } catch (err) {
      const status = err?.response?.status;
      setErro(status === 403 ? "Você não tem permissão para ver esta tela." : err?.response?.data?.error || "Não foi possível carregar as rupturas. Tente de novo.");
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function toggleLoja(cod) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }

  function aplicarPedidoFeito(atualizada) {
    setDados((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lojas: prev.lojas.map((l) => ({ ...l, itens: l.itens.map((r) => (r._id === atualizada._id ? { ...r, pedidoFeito: atualizada.pedidoFeito } : r)) })),
      };
    });
    setToast("Pedido registrado!");
    setTimeout(() => setToast(""), 3000);
  }

  const lojas = dados?.lojas || [];
  const pendentes = lojas.reduce((s, l) => s + l.itens.filter((r) => !(r.pedidoFeito && r.pedidoFeito.em)).length, 0);

  return (
    <div className="space-y-4">
      {dados && !loading && (
        <p className="text-xs text-neutral-500">
          {dados.total} {dados.total === 1 ? "ruptura ativa" : "rupturas ativas"} em {lojas.length} {lojas.length === 1 ? "loja" : "lojas"}
          {dados.total > 0 && ` · ${pendentes} sem pedido`}
        </p>
      )}

      {erro && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger">
          <IcoAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            {erro}
            <button type="button" onClick={carregar} className="ml-2 font-semibold underline underline-offset-2">Tentar de novo</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !erro && lojas.length === 0 ? (
        <EmptyState
          icon={IcoBoxOff}
          titulo="Nenhuma ruptura ativa"
          descricao="Quando o promotor contar zero e marcar ruptura, o item aparece aqui. Ele sai sozinho quando uma contagem posterior encontrar produto."
        />
      ) : (
        <div className="space-y-2">
          {lojas.map((loja) => {
            const semPedido = loja.itens.filter((r) => !(r.pedidoFeito && r.pedidoFeito.em)).length;
            return (
              <LojaCard
                key={loja.clienteCodigo}
                loja={loja}
                tone={semPedido > 0 ? "danger" : "neutral"}
                totalLabel={`${loja.itens.length} ${loja.itens.length === 1 ? "item" : "itens"}`}
                resumo={semPedido > 0 && (
                  <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-danger/15 px-1.5 py-0.5 font-bold text-danger">
                    <span className="h-1 w-1 rounded-full bg-danger" aria-hidden />{semPedido} sem pedido
                  </span>
                )}
                expanded={expanded.has(loja.clienteCodigo)}
                onToggle={() => toggleLoja(loja.clienteCodigo)}
              >
                {loja.itens.map((r) => <RupturaItem key={r._id} r={r} onMarcar={setAlvo} />)}
              </LojaCard>
            );
          })}
        </div>
      )}

      {alvo && <PedidoFeitoDialog ruptura={alvo} onClose={() => setAlvo(null)} onFeito={aplicarPedidoFeito} />}

      {toast && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-5 py-2.5 text-sm font-semibold text-white animate-fade-in">
          <IcoCheck className="h-4 w-4" aria-hidden />{toast}
        </div>
      )}
    </div>
  );
}
