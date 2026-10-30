"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTituloDaPagina } from "@/components/PageTitleContext";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { indexarAtivas, acaoAtivaDe } from "@/lib/estoque";
import { TONE } from "@/lib/tones";
import { IcoSearch, IcoX, IcoStore, IcoAlert } from "@/components/Icons";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import RebaixaModal from "@/components/RebaixaModal";
import LojaCard from "@/components/visao/LojaCard";
import ItemLojaCard from "@/components/visao/ItemLojaCard";
import { CHIPS, itemParaSolicitacao } from "@/components/visao/situacoes";

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

function Chip({ ativo, tone = "neutral", label, n, onClick }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]",
        ativo ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {tone !== "neutral" && <span className={clsx("h-1.5 w-1.5 rounded-full", ativo ? "bg-white/80" : t.dot)} aria-hidden />}
      {label}
      {n != null && <span className={clsx("tabular-nums", ativo ? "text-white/80" : "text-neutral-400")}>{fmtNum(n)}</span>}
    </button>
  );
}

function ResumoLoja({ totais }) {
  const partes = [
    totais.ruptura > 0 && { n: totais.ruptura, label: "rupt.", cls: "bg-danger/15 text-danger", dot: "bg-danger" },
    totais.rebaixa > 0 && { n: totais.rebaixa, label: "rebaixa", cls: "bg-danger/15 text-danger", dot: "bg-danger" },
    totais.giro > 0 && { n: totais.giro, label: "giro", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
    totais.nao_contado > 0 && { n: totais.nao_contado, label: "não cont.", cls: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  ].filter(Boolean);
  return partes.map((p) => (
    <span key={p.label} className={clsx("inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold", p.cls)}>
      <span className={clsx("h-1 w-1 rounded-full", p.dot)} aria-hidden />{p.n} {p.label}
    </span>
  ));
}

export default function VisaoEstoquePage() {
  useTituloDaPagina("Visão das lojas", "Tudo o que cada loja comprou nos últimos 90 dias, com a última contagem");
  const { user } = useAuth();
  const podeSolicitar = pode(user, "solicitacoes.criar");

  const [filtro, setFiltro] = useState("todos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState(""); // valor aplicado (Enter / limpar)
  const [resumo, setResumo] = useState(null);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [acoesAtivas, setAcoesAtivas] = useState([]);
  const [form, setForm] = useState(null); // { item, tipo }
  const [toast, setToast] = useState("");

  const carregarResumo = useCallback(async () => {
    try {
      const { data } = await api.get("/visao/resumo");
      setResumo(data);
    } catch {
      setResumo(null);
    }
  }, []);

  const carregarAtivas = useCallback(async () => {
    try {
      const { data } = await api.get("/solicitacoes/ativas");
      setAcoesAtivas(data.ativas || []);
    } catch {
      setAcoesAtivas([]);
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = {};
      if (filtro !== "todos") params.situacao = filtro;
      if (busca) params.q = busca;
      const { data } = await api.get("/visao/estoque", { params });
      setDados(data);
      // Com filtro ou busca, abre as lojas direto (poucas); sem filtro, deixa fechadas
      if (filtro !== "todos" || busca) setExpanded(new Set((data.lojas || []).slice(0, 20).map((l) => l.clienteCodigo)));
    } catch (err) {
      const status = err?.response?.status;
      setErro(status === 403 ? "Você não tem permissão para ver esta tela." : err?.response?.data?.error || "Não foi possível carregar as lojas. Tente de novo.");
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [filtro, busca]);

  useEffect(() => { carregarResumo(); carregarAtivas(); }, [carregarResumo, carregarAtivas]);
  useEffect(() => { carregar(); }, [carregar]);

  const ativasIdx = useMemo(() => indexarAtivas(acoesAtivas), [acoesAtivas]);

  function toggleLoja(cod) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }

  function handleEnviado() {
    setToast("Solicitação enviada!");
    setTimeout(() => setToast(""), 3000);
    carregarAtivas();
  }

  const porSituacao = resumo?.porSituacao || {};
  const lojas = dados?.lojas || [];

  return (
    <div className="space-y-4">
      {/* Chips de filtro (rolam na horizontal no celular) */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <Chip ativo={filtro === "todos"} label="Todos" n={resumo ? resumo.total : null} onClick={() => setFiltro("todos")} />
        {CHIPS.map((c) => (
          <Chip key={c.key} ativo={filtro === c.key} tone={c.tone} label={c.label} n={resumo ? porSituacao[c.key] || 0 : null} onClick={() => setFiltro(c.key)} />
        ))}
      </div>

      {/* Busca por produto */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
          <IcoSearch className="h-5 w-5" aria-hidden />
        </span>
        <input
          className="input pl-10 pr-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto..."
          onKeyDown={(e) => e.key === "Enter" && setBusca(q.trim())}
          aria-label="Buscar produto"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setBusca(""); }} aria-label="Limpar" className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100">
            <IcoX className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {dados && !loading && (
        <p className="text-xs text-neutral-500">
          {fmtNum(dados.totais?.itens)} {dados.totais?.itens === 1 ? "item" : "itens"} em {fmtNum(dados.lojasTotal)} {dados.lojasTotal === 1 ? "loja" : "lojas"}
          {dados.truncado && ` · mostrando as ${fmtNum(lojas.length)} primeiras lojas, use a busca ou os filtros`}
          {dados.atualizadoEm && ` · atualizado ${fmtDataHora(dados.atualizadoEm)}`}
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
          {[0, 1, 2, 3].map((i) => (
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
          icon={IcoStore}
          titulo={filtro !== "todos" || busca ? "Nenhum item corresponde ao filtro" : "Nenhuma loja na sua carteira ainda"}
          descricao={filtro !== "todos" || busca ? "Tente outro filtro ou outra busca." : "Os dados aparecem depois da próxima sincronização do estoque e das compras."}
        />
      ) : (
        <div className="space-y-2">
          {lojas.map((loja) => {
            const t = loja.totais || {};
            const tone = t.ruptura + t.rebaixa > 0 ? "danger" : t.giro > 0 ? "warning" : "neutral";
            return (
              <LojaCard
                key={loja.clienteCodigo}
                loja={loja}
                tone={tone}
                totalLabel={`${fmtNum(loja.itens.length)} ${loja.itens.length === 1 ? "item" : "itens"}`}
                resumo={<ResumoLoja totais={t} />}
                expanded={expanded.has(loja.clienteCodigo)}
                onToggle={() => toggleLoja(loja.clienteCodigo)}
              >
                {loja.itens.map((item) => (
                  <ItemLojaCard
                    key={item._id || item.chave}
                    item={item}
                    podeSolicitar={podeSolicitar}
                    acaoAtiva={acaoAtivaDe(ativasIdx, item)}
                    onSolicitar={(it, tipo) => setForm({ item: itemParaSolicitacao(it), tipo })}
                  />
                ))}
              </LojaCard>
            );
          })}
        </div>
      )}

      {form && (
        <RebaixaModal item={form.item} tipo={form.tipo} onClose={() => setForm(null)} onEnviado={handleEnviado} />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-5 py-2.5 text-sm font-semibold text-white animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
