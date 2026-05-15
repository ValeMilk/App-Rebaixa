"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import { IcoSearch, IcoX, IcoChevronDown, IcoStore, IcoAlert, IcoClock, IcoPackage, IcoTrendDown, IcoTag, IcoUsers } from "@/components/Icons";

const CLS = {
  critico:  { label: "Crítico",  bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500",    ring: "ring-red-100" },
  alerta:   { label: "Alerta",   bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500", ring: "ring-orange-100" },
  atencao:  { label: "Atenção",  bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500",  ring: "ring-amber-100" },
  ok:       { label: "Regular",  bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200",dot: "bg-emerald-500",ring: "ring-emerald-100" },
  vencido:  { label: "Vencido",  bg: "bg-slate-50",   text: "text-slate-600",  border: "border-slate-200",  dot: "bg-slate-400",  ring: "ring-slate-100" },
};

function Badge({ cls }) {
  const c = CLS[cls] || CLS.ok;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function fmtBRL(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcMargem(precoOferta, custo) {
  const p = Number(precoOferta);
  const c = Number(custo);
  if (!p || !c || p <= 0) return null;
  return ((p - c) / p) * 100;
}

function MargemBadge({ pct }) {
  if (pct == null) return <span className="text-slate-300 text-2xl font-bold">—</span>;
  const cor = pct >= 20
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : pct >= 10
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-block font-bold text-2xl px-4 py-1.5 rounded-xl border ${cor}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function RebaixaModal({ item, onClose, onEnviado }) {
  const [precoOferta, setPrecoOferta] = useState("");
  const [sellout, setSellout] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const margem = calcMargem(precoOferta, item.custo);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!precoOferta) { setErro("Informe o preço da oferta"); return; }
    setEnviando(true);
    try {
      await api.post("/solicitacoes", {
        tipo: "rebaixa",
        cliente: item.cliente,
        clienteCodigo: item.clienteCodigo,
        codigoRede: item.codigoRede || null,
        redeSubrede: item.redeSubrede || null,
        motivo,
        itens: [{
          produto: item.produto,
          produtoCodigo: item.produtoCodigo,
          quantidade: item.quantidade,
          dataValidade: item.dataValidade,
          diasParaVencer: item.diasParaVencer,
          precoTabela: item.precoTabela,
          precoOferta: Number(precoOferta),
          sellout: sellout ? Number(sellout) : undefined,
          margemCalculada: margem != null ? Math.round(margem * 10) / 10 : undefined,
          estoqueRefId: item._id,
        }],
      });
      onEnviado();
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao criar solicitação");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto animate-slide-up safe-area-pb">
        <div className="sticky top-0 bg-white pt-3 pb-2 z-10 rounded-t-3xl">
          <div className="flex justify-center">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
        </div>
        <div className="px-5 pb-6">
          {/* Banner de rede */}
          {item.redeSubrede && (
            <div className="mb-4 flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-2xl px-3.5 py-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <IcoUsers className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-blue-700 leading-tight">Rebaixa por Rede</div>
                <div className="text-[11px] text-blue-600 truncate mt-0.5">{item.redeSubrede}</div>
              </div>
              <span className="shrink-0 text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">todas as lojas</span>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <IcoTrendDown className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-slate-900 text-lg leading-tight">{item.produto}</h2>
                <p className="text-slate-500 text-sm mt-0.5 truncate">{item.cliente}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="shrink-0 h-9 w-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600">
              <IcoX className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-slate-50 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-slate-400 mb-1">
                <IcoPackage className="w-4 h-4" />
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Qtd</div>
              <div className="font-bold text-slate-800 text-xl mt-0.5">{item.quantidade}</div>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-slate-400 mb-1">
                <IcoClock className="w-4 h-4" />
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Vence em</div>
              <div className={`font-bold text-xl mt-0.5 ${item.diasParaVencer <= 15 ? "text-red-600" : "text-slate-800"}`}>{item.diasParaVencer ?? "—"}d</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{fmtData(item.dataValidade)}</div>
            </div>
            <div className="bg-brand/5 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-brand/60 mb-1">
                <IcoTag className="w-4 h-4" />
              </div>
              <div className="text-[10px] text-brand/70 uppercase tracking-wide font-semibold">Tabela</div>
              <div className="font-bold text-brand text-base mt-0.5">{fmtBRL(item.precoTabela)}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preço da Oferta (R$)</label>
              <input
                type="number" step="0.01" min="0"
                className="input text-2xl font-bold py-3"
                value={precoOferta}
                onChange={(e) => setPrecoOferta(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sellout (R$ ao consumidor)</label>
              <input
                type="number" step="0.01" min="0"
                className="input"
                value={sellout}
                onChange={(e) => setSellout(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl p-4 flex items-center justify-between border border-slate-200">
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-0.5">Margem Valemilk</div>
                <div className="text-xs text-slate-400">{item.custo ? `Custo: ${fmtBRL(item.custo)}` : "Custo não disponível"}</div>
              </div>
              <MargemBadge pct={margem} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Motivo</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produto próximo ao vencimento"
              />
            </div>

            {erro && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-700 flex items-center gap-2 animate-fade-in">
                <IcoAlert className="w-4 h-4 shrink-0" />
                {erro}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3.5 text-base" disabled={enviando}>
              {enviando ? "Enviando..." : "Solicitar Rebaixa"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProdutoCard({ item, onRebaixar }) {
  const c = CLS[item.classificacao] || CLS.ok;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${c.border} ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800 text-sm leading-tight truncate">{item.produto}</div>
        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><IcoPackage className="w-3 h-3" />{item.quantidade}</span>
          <span className="inline-flex items-center gap-1"><IcoClock className="w-3 h-3" />{fmtData(item.dataValidade)}</span>
          {item.precoTabela && <span className="inline-flex items-center gap-1"><IcoTag className="w-3 h-3" />{fmtBRL(item.precoTabela)}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Badge cls={item.classificacao} />
        <button
          onClick={() => onRebaixar(item)}
          className="text-xs font-semibold text-brand border border-brand/30 bg-white px-3 py-1 rounded-lg hover:bg-brand/5 active:scale-95 transition"
        >
          Rebaixar
        </button>
      </div>
    </div>
  );
}

function LojaCard({ clienteCodigo, clienteNome, redeSubrede, itens, expanded, onToggle, onRebaixar }) {
  const criticos = itens.filter((i) => i.classificacao === "critico").length;
  const alertas  = itens.filter((i) => i.classificacao === "alerta").length;
  const borda = criticos > 0 ? "border-red-200" : alertas > 0 ? "border-orange-200" : "border-slate-200";
  const iconBg = criticos > 0 ? "bg-red-50 text-red-600" : alertas > 0 ? "bg-orange-50 text-orange-600" : "bg-brand/10 text-brand";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${borda}`}>
      <button className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-slate-50 transition-colors" onClick={onToggle}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <IcoStore className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 truncate text-sm">{clienteNome}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>Cód {clienteCodigo} · {itens.length} produto{itens.length !== 1 ? "s" : ""}</span>
            {redeSubrede && (
              <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                <IcoUsers className="w-3 h-3" />{redeSubrede}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 items-center shrink-0">
          {criticos > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{criticos}</span>}
          {alertas > 0 && <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{alertas}</span>}
          <IcoChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2 animate-fade-in">
          {itens.map((item) => (
            <ProdutoCard key={item._id} item={item} onRebaixar={onRebaixar} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstoquePage() {
  const [itens, setItens] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [formItem, setFormItem] = useState(null);
  const [toast, setToast] = useState("");

  const carregar = useCallback(async (search) => {
    setLoading(true);
    try {
      const params = { limit: 1000 };
      const s = search !== undefined ? search : q;
      if (s) params.q = s;
      const { data } = await api.get("/estoque", { params });
      setItens(data.itens || []);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { carregar(""); }, []);

  const grupos = useMemo(() => {
    const map = new Map();
    for (const it of itens) {
      const k = it.clienteCodigo;
      if (!map.has(k)) map.set(k, { clienteCodigo: k, clienteNome: it.cliente, redeSubrede: it.redeSubrede || null, itens: [] });
      map.get(k).itens.push(it);
    }
    return Array.from(map.values()).sort((a, b) => {
      const score = (g) =>
        g.itens.filter((i) => i.classificacao === "critico").length * 100 +
        g.itens.filter((i) => i.classificacao === "alerta").length * 10 +
        g.itens.filter((i) => i.classificacao === "atencao").length;
      return score(b) - score(a);
    });
  }, [itens]);

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
  }

  const totCritico = itens.filter((i) => i.classificacao === "critico").length;
  const totAlerta  = itens.filter((i) => i.classificacao === "alerta").length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Lojas</h1>
          <p className="text-slate-500 text-sm mt-0.5">Produtos próximos ao vencimento</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
          <IcoStore className="w-5 h-5" />
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-2">
        <div className="stat-card bg-red-50 border-red-100">
          <div className="flex items-center justify-center text-red-500 mb-1">
            <IcoAlert className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-red-700 leading-none">{loading ? "…" : totCritico}</div>
          <div className="text-[10px] text-red-600 font-semibold uppercase tracking-wide mt-1">Críticos</div>
        </div>
        <div className="stat-card bg-orange-50 border-orange-100">
          <div className="flex items-center justify-center text-orange-500 mb-1">
            <IcoClock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-orange-700 leading-none">{loading ? "…" : totAlerta}</div>
          <div className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide mt-1">Alertas</div>
        </div>
        <div className="stat-card bg-brand/5 border-brand/10">
          <div className="flex items-center justify-center text-brand/70 mb-1">
            <IcoStore className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-brand leading-none">{loading ? "…" : grupos.length}</div>
          <div className="text-[10px] text-brand/80 font-semibold uppercase tracking-wide mt-1">Lojas</div>
        </div>
      </div>

      {/* Busca com ícone */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <IcoSearch className="w-5 h-5" />
        </span>
        <input
          className="input pl-10 pr-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto..."
          onKeyDown={(e) => e.key === "Enter" && carregar()}
        />
        {q && (
          <button onClick={() => { setQ(""); carregar(""); }} aria-label="Limpar" className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center">
            <IcoX className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-9 h-9 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
          <p className="text-sm text-slate-400">Carregando...</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <IcoStore className="w-7 h-7" />
          </div>
          <p className="text-slate-500 font-medium">Nenhum produto encontrado</p>
          <p className="text-slate-400 text-sm mt-1">Tente ajustar a busca</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map(({ clienteCodigo, clienteNome, redeSubrede, itens: gItens }) => (
            <LojaCard
              key={clienteCodigo}
              clienteCodigo={clienteCodigo}
              clienteNome={clienteNome}
              redeSubrede={redeSubrede}
              itens={gItens}
              expanded={expanded.has(clienteCodigo)}
              onToggle={() => toggleLoja(clienteCodigo)}
              onRebaixar={setFormItem}
            />
          ))}
        </div>
      )}

      {formItem && (
        <RebaixaModal item={formItem} onClose={() => setFormItem(null)} onEnviado={handleEnviado} />
      )}

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg z-50 pointer-events-none animate-fade-in flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
