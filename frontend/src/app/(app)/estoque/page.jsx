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
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
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
  if (pct == null) return <span className="text-slate-300 text-base font-bold">—</span>;
  const cor = pct >= 20
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : pct >= 10
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-block font-bold text-xl px-3 py-0.5 rounded-xl border ${cor}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function RebaixaModal({ item, onClose, onEnviado }) {
  const [precoOferta, setPrecoOferta] = useState("");
  const [precoPDV, setPrecoPDV] = useState("");
  const [sellout, setSellout] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  // Última compra: { encontrado, precoUltimaCompra, dataUltimaCompra } | null (loading)
  const [ultimaCompra, setUltimaCompra] = useState(null);
  const [loadingUC, setLoadingUC] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoadingUC(true);
    api.get("/erp/ultima-compra", {
      params: { clienteCodigo: item.clienteCodigo, produtoCodigo: item.produtoCodigo },
    })
      .then(({ data }) => { if (!cancelado) setUltimaCompra(data); })
      .catch(() => { if (!cancelado) setUltimaCompra({ encontrado: false }); })
      .finally(() => { if (!cancelado) setLoadingUC(false); });
    return () => { cancelado = true; };
  }, [item.clienteCodigo, item.produtoCodigo]);

  const precoUC = ultimaCompra?.encontrado ? Number(ultimaCompra.precoUltimaCompra) : null;
  const dataUC  = ultimaCompra?.encontrado ? ultimaCompra.dataUltimaCompra : null;

  // Margem PDV = (PreçoPDV - ÚltimaCompra) / PreçoPDV
  const margemPDV = useMemo(() => {
    const p = Number(precoPDV);
    if (!p || p <= 0 || precoUC == null) return null;
    return ((p - precoUC) / p) * 100;
  }, [precoPDV, precoUC]);

  // Margem Oferta = (PreçoOferta - (ÚltimaCompra - Sellout)) / PreçoOferta
  const margemOferta = useMemo(() => {
    const o = Number(precoOferta);
    if (!o || o <= 0 || precoUC == null) return null;
    const s = Number(sellout) || 0;
    const tabelaComSellout = precoUC - s;
    return ((o - tabelaComSellout) / o) * 100;
  }, [precoOferta, sellout, precoUC]);

  // Sellout sugerido = valor que mantém a mesma margem do PDV na oferta
  // Derivado de: (Oferta - (UC - Sellout)) / Oferta = margemPDV
  // => Sellout = UC - Oferta * (1 - margemPDV/100)
  const selloutSugerido = useMemo(() => {
    const o = Number(precoOferta);
    if (!o || o <= 0 || precoUC == null || margemPDV == null) return null;
    const s = precoUC - o * (1 - margemPDV / 100);
    if (s <= 0) return null;
    return Math.round(s * 100) / 100;
  }, [precoOferta, precoUC, margemPDV]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!precoOferta) { setErro("Informe o preço da oferta"); return; }
    if (!precoPDV)    { setErro("Informe o preço PDV"); return; }
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
          precoPDV: Number(precoPDV),
          sellout: sellout ? Number(sellout) : 0,
          precoUltimaCompra: precoUC ?? undefined,
          dataUltimaCompra: dataUC ?? undefined,
          margemPDV:    margemPDV    != null ? Math.round(margemPDV    * 10) / 10 : undefined,
          margemOferta: margemOferta != null ? Math.round(margemOferta * 10) / 10 : undefined,
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
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white shadow-2xl flex flex-col w-full sm:max-w-md sm:rounded-3xl sm:max-h-[90dvh] animate-slide-up safe-area-pb"
        style={{ height: "100dvh", maxHeight: "100dvh" }}>

        {/* Header fixo */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-slate-100 bg-white sm:rounded-t-3xl safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-0.5">Nova Rebaixa</div>
              <h2 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">{item.produto}</h2>
            </div>
            <button onClick={onClose} aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full bg-slate-100 active:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          {/* Cliente + Rede */}
          <div className="mb-3 bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Cliente</div>
            <div className="text-sm font-semibold text-slate-800 truncate">{item.cliente}</div>
            {item.redeSubrede && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold">
                <IcoUsers className="w-3 h-3" />
                <span className="truncate">Rebaixa para toda a rede</span>
              </div>
            )}
          </div>

          {/* Info strip horizontal: Qtd · Vence · Última Compra */}
          <div className="flex items-stretch rounded-xl border border-slate-100 overflow-hidden mb-3">
            <div className="flex-1 bg-white px-2 py-2 text-center">
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">Qtd</div>
              <div className="font-bold text-slate-800 text-lg leading-tight">{item.quantidade}</div>
            </div>
            <div className="flex-1 bg-white px-2 py-2 text-center border-x border-slate-100">
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">Vence</div>
              <div className={`font-bold text-lg leading-tight ${item.diasParaVencer <= 15 ? "text-red-600" : "text-slate-800"}`}>
                {item.diasParaVencer ?? "—"}d
              </div>
              <div className="text-[9px] text-slate-400">{fmtData(item.dataValidade)}</div>
            </div>
            <div className="flex-1 bg-brand/5 px-2 py-2 text-center">
              <div className="text-[9px] text-brand/70 font-semibold uppercase tracking-wide">Últ. Compra</div>
              {loadingUC ? (
                <div className="text-slate-400 text-xs mt-1">…</div>
              ) : precoUC != null ? (
                <>
                  <div className="font-bold text-brand text-sm leading-tight mt-0.5">{fmtBRL(precoUC)}</div>
                  <div className="text-[9px] text-slate-400">{fmtData(dataUC)}</div>
                </>
              ) : (
                <div className="text-slate-400 text-xs mt-1">Sem histórico</div>
              )}
            </div>
          </div>

          {!loadingUC && precoUC == null && (
            <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
              <IcoAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Cliente sem histórico de compra deste produto. As margens não poderão ser calculadas.</span>
            </div>
          )}

          <form id="form-rebaixa" onSubmit={handleSubmit} className="space-y-2.5">
            {/* Preço PDV */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Preço PDV (R$) *</label>
              <input
                type="number" step="0.01" min="0"
                className="input"
                value={precoPDV}
                onChange={(e) => setPrecoPDV(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </div>

            {/* Margem PDV */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-700">Margem PDV</div>
                <div className="text-[10px] text-slate-400">(PDV − Últ. Compra) / PDV</div>
              </div>
              <MargemBadge pct={margemPDV} />
            </div>

            {/* Preço Oferta */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Preço da Oferta (R$) *</label>
              <input
                type="number" step="0.01" min="0"
                className="input text-2xl font-bold py-2"
                value={precoOferta}
                onChange={(e) => setPrecoOferta(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </div>

            {/* Sellout */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Sellout (R$ desconto sobre últ. compra)</label>
              <input
                type="number" step="0.01" min="0"
                className="input"
                value={sellout}
                onChange={(e) => setSellout(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
              {selloutSugerido != null && String(sellout) !== String(selloutSugerido) && (
                <button
                  type="button"
                  onClick={() => setSellout(String(selloutSugerido))}
                  className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-600 font-semibold hover:text-blue-800 active:opacity-70 transition"
                >
                  <span className="inline-block w-3.5 h-3.5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center">↑</span>
                  Sugerido {fmtBRL(selloutSugerido)} — manter margem PDV ({margemPDV?.toFixed(1)}%)
                </button>
              )}
            </div>

            {/* Margem Oferta */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-700">Margem Oferta</div>
                <div className="text-[10px] text-slate-400">(Oferta − (Últ. Compra − Sellout)) / Oferta</div>
              </div>
              <MargemBadge pct={margemOferta} />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Motivo</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produto próximo ao vencimento"
              />
            </div>

            {erro && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2 animate-fade-in">
                <IcoAlert className="w-4 h-4 shrink-0" />
                {erro}
              </div>
            )}
          </form>
        </div>

        {/* Footer fixo com botão */}
        <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <button type="submit" form="form-rebaixa" className="btn-primary w-full py-3 text-base" disabled={enviando}>
            {enviando ? "Enviando..." : "Solicitar Rebaixa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RedeRebaixaModal({ redeSubrede, codigoRede, lojas, onClose, onEnviado }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const totalItens = lojas.reduce((s, l) => s + l.itens.length, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await Promise.all(
        lojas.map((loja) =>
          api.post("/solicitacoes", {
            tipo: "rebaixa",
            cliente: loja.clienteNome,
            clienteCodigo: loja.clienteCodigo,
            codigoRede,
            redeSubrede,
            motivo,
            itens: loja.itens.map((item) => ({
              produto: item.produto,
              produtoCodigo: item.produtoCodigo,
              quantidade: item.quantidade,
              dataValidade: item.dataValidade,
              diasParaVencer: item.diasParaVencer,
              precoTabela: item.precoTabela,
              estoqueRefId: item._id,
            })),
          })
        )
      );
      onEnviado(lojas.length);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao criar solicitações");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white shadow-2xl flex flex-col w-full sm:max-w-md sm:rounded-3xl sm:max-h-[90dvh] animate-slide-up safe-area-pb"
        style={{ height: "100dvh", maxHeight: "100dvh" }}>

        {/* Header fixo */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-slate-100 bg-white sm:rounded-t-3xl safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Rebaixa por Rede</div>
              <h2 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">{redeSubrede}</h2>
            </div>
            <button onClick={onClose} aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full bg-slate-100 active:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          {/* Resumo da rede */}
          <div className="mb-3 bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-bold">
              <IcoUsers className="w-3.5 h-3.5" />
              {redeSubrede}
            </div>
            <div className="text-xs text-slate-600">
              <span className="font-semibold">{lojas.length}</span> lojas ·{" "}
              <span className="font-semibold">{totalItens}</span> produto{totalItens !== 1 ? "s" : ""}
            </div>
            <div className="space-y-1 pt-1 border-t border-slate-100">
              {lojas.map((l) => (
                <div key={l.clienteCodigo} className="text-[11px] text-slate-500 flex justify-between gap-2">
                  <span className="truncate">{l.clienteNome}</span>
                  <span className="shrink-0 text-slate-400">{l.itens.length} prod.</span>
                </div>
              ))}
            </div>
          </div>

          <form id="form-rede-rebaixa" onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Motivo</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produtos próximos ao vencimento"
              />
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 flex items-start gap-2">
              <IcoUsers className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Será criada <strong>1 solicitação por loja</strong> ({lojas.length} no total). O supervisor define os preços na aprovação.</span>
            </div>
            {erro && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2 animate-fade-in">
                <IcoAlert className="w-4 h-4 shrink-0" />
                {erro}
              </div>
            )}
          </form>
        </div>

        {/* Footer fixo */}
        <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <button type="submit" form="form-rede-rebaixa"
            className="w-full py-3 text-base font-semibold text-white bg-blue-600 rounded-2xl hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-60"
            disabled={enviando}>
            {enviando ? `Enviando ${lojas.length} sol...` : `Solicitar para ${lojas.length} Loja${lojas.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProdutoCard({ item, onRebaixar }) {
  const c = CLS[item.classificacao] || CLS.ok;
  return (
    <div className={`p-3 rounded-xl border ${c.border} ${c.bg}`}>
      <div className="flex items-start gap-2 mb-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${c.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 text-sm leading-snug">{item.produto}</div>
          <div className="text-xs text-slate-500 mt-1 flex gap-x-2 gap-y-1 flex-wrap items-center">
            <Badge cls={item.classificacao} />
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><IcoPackage className="w-3 h-3" />{item.quantidade} un</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><IcoClock className="w-3 h-3" />{fmtData(item.dataValidade)} · {item.diasParaVencer}d</span>
            {item.precoTabela && <span className="inline-flex items-center gap-1 whitespace-nowrap"><IcoTag className="w-3 h-3" />{fmtBRL(item.precoTabela)}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={() => onRebaixar(item)}
        className="w-full py-2 text-sm font-semibold text-brand border border-brand/30 bg-white rounded-xl hover:bg-brand/5 active:scale-[0.98] transition"
      >
        Solicitar Rebaixa
      </button>
    </div>
  );
}

function LojaCard({ clienteCodigo, clienteNome, redeSubrede, itens, expanded, onToggle, onRebaixar }) {
  const criticos = itens.filter((i) => i.classificacao === "critico").length;
  const alertas  = itens.filter((i) => i.classificacao === "alerta").length;
  const borda = criticos > 0 ? "border-red-200" : alertas > 0 ? "border-orange-200" : "border-slate-200";
  const iconBg = criticos > 0 ? "bg-red-50 text-red-600" : alertas > 0 ? "bg-orange-50 text-orange-600" : "bg-brand/10 text-brand";

  // Esconde rede quando duplica o nome do cliente (ex.: cliente "COMPREMAX - X" e rede "COMPREMAX")
  const mostrarRede = redeSubrede && !clienteNome.toUpperCase().startsWith(redeSubrede.toUpperCase());

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${borda}`}>
      <button className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-slate-50 transition-colors" onClick={onToggle}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <IcoStore className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 truncate text-sm">{clienteNome}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="whitespace-nowrap">{itens.length} prod.</span>
            {criticos > 0 && (
              <span className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-red-500" />{criticos} crít.
              </span>
            )}
            {alertas > 0 && (
              <span className="inline-flex items-center gap-0.5 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-orange-500" />{alertas} alerta{alertas !== 1 ? "s" : ""}
              </span>
            )}
            {mostrarRede && (
              <span className="inline-flex items-center gap-1 text-blue-600 font-semibold whitespace-nowrap">
                <IcoUsers className="w-3 h-3" />{redeSubrede}
              </span>
            )}
          </div>
        </div>
        <IcoChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
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

function RedeCard({ codigoRede, redeSubrede, lojas, expandedRede, expandedLojas, onToggleRede, onToggleLoja, onRebaixar, onSolicitarRede }) {
  const totalItens    = lojas.reduce((s, l) => s + l.itens.length, 0);
  const totalCriticos = lojas.reduce((s, l) => s + l.itens.filter((i) => i.classificacao === "critico").length, 0);
  const totalAlertas  = lojas.reduce((s, l) => s + l.itens.filter((i) => i.classificacao === "alerta").length, 0);

  const borda  = totalCriticos > 0 ? "border-red-200"          : totalAlertas > 0 ? "border-orange-200"        : "border-blue-200";
  const iconBg = totalCriticos > 0 ? "bg-red-50 text-red-600"  : totalAlertas > 0 ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${borda}`}>
      <button className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-slate-50 transition-colors" onClick={onToggleRede}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <IcoUsers className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 truncate text-sm">{redeSubrede}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="whitespace-nowrap">{lojas.length} lojas · {totalItens} prod.</span>
            {totalCriticos > 0 && (
              <span className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-red-500" />{totalCriticos} crít.
              </span>
            )}
            {totalAlertas > 0 && (
              <span className="inline-flex items-center gap-0.5 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-orange-500" />{totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <IcoChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${expandedRede ? "rotate-180" : ""}`} />
      </button>

      {expandedRede && (
        <div className="border-t border-slate-100 animate-fade-in">
          <div className="px-3 pt-2.5 pb-2">
            <button
              onClick={onSolicitarRede}
              className="w-full py-2 text-sm font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-xl hover:bg-blue-100 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <IcoUsers className="w-4 h-4" />
              Solicitar Rebaixa para toda a Rede
            </button>
          </div>
          <div className="px-3 pb-3 space-y-2">
            {lojas.map((loja) => (
              <LojaCard
                key={loja.clienteCodigo}
                clienteCodigo={loja.clienteCodigo}
                clienteNome={loja.clienteNome}
                redeSubrede={null}
                itens={loja.itens}
                expanded={expandedLojas.has(loja.clienteCodigo)}
                onToggle={() => onToggleLoja(loja.clienteCodigo)}
                onRebaixar={onRebaixar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EstoquePage() {
  const [itens, setItens] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());       // lojas
  const [expandedRedes, setExpandedRedes] = useState(new Set()); // redes
  const [formItem, setFormItem] = useState(null);
  const [formRede, setFormRede] = useState(null); // { codigoRede, redeSubrede, lojas }
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

  const redeGrupos = useMemo(() => {
    // 1) Agrupa itens por loja
    const lojaMap = new Map();
    for (const it of itens) {
      const k = it.clienteCodigo;
      if (!lojaMap.has(k)) lojaMap.set(k, {
        clienteCodigo: k,
        clienteNome: it.cliente,
        codigoRede: it.codigoRede || null,
        redeSubrede: it.redeSubrede || null,
        itens: [],
      });
      lojaMap.get(k).itens.push(it);
    }
    // 2) Agrupa lojas por rede
    const redeMap = new Map();
    for (const loja of lojaMap.values()) {
      const redeKey = loja.codigoRede || `__solo__${loja.clienteCodigo}`;
      if (!redeMap.has(redeKey)) redeMap.set(redeKey, {
        codigoRede: loja.codigoRede,
        redeSubrede: loja.redeSubrede,
        lojas: [],
      });
      redeMap.get(redeKey).lojas.push(loja);
    }
    // 3) Ordena por criticidade
    const scoreGrupo = (lojas) => lojas.reduce((s, l) =>
      s + l.itens.filter((i) => i.classificacao === "critico").length * 100
        + l.itens.filter((i) => i.classificacao === "alerta").length * 10
        + l.itens.filter((i) => i.classificacao === "atencao").length, 0);
    return Array.from(redeMap.values()).sort((a, b) => scoreGrupo(b.lojas) - scoreGrupo(a.lojas));
  }, [itens]);

  const totalLojas = redeGrupos.reduce((s, g) => s + g.lojas.length, 0);

  function toggleLoja(cod) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }

  function toggleRede(key) {
    setExpandedRedes((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  function handleEnviado(count = 1) {
    const msg = count > 1 ? `${count} solicitações enviadas!` : "Solicitação enviada!";
    setToast(msg);
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
      <div className="grid grid-cols-3 gap-2 overflow-hidden">
        <div className="stat-card bg-red-50 border-red-100 min-w-0">
          <div className="flex items-center justify-center text-red-500 mb-1">
            <IcoAlert className="w-4 h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-red-700 leading-none tabular-nums">{loading ? "…" : totCritico}</div>
          <div className="text-[10px] text-red-600 font-semibold uppercase tracking-wide mt-1">Críticos</div>
        </div>
        <div className="stat-card bg-orange-50 border-orange-100 min-w-0">
          <div className="flex items-center justify-center text-orange-500 mb-1">
            <IcoClock className="w-4 h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-orange-700 leading-none tabular-nums">{loading ? "…" : totAlerta}</div>
          <div className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide mt-1">Alertas</div>
        </div>
        <div className="stat-card bg-brand/5 border-brand/10 min-w-0">
          <div className="flex items-center justify-center text-brand/70 mb-1">
            <IcoStore className="w-4 h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-brand leading-none tabular-nums">{loading ? "…" : totalLojas}</div>
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
      ) : redeGrupos.length === 0 ? (
        <div className="text-center py-16 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <IcoStore className="w-7 h-7" />
          </div>
          <p className="text-slate-500 font-medium">Nenhum produto encontrado</p>
          <p className="text-slate-400 text-sm mt-1">Tente ajustar a busca</p>
        </div>
      ) : (
        <div className="space-y-2">
          {redeGrupos.map((grupo) => {
            const { codigoRede, redeSubrede, lojas } = grupo;
            // Rede com múltiplas lojas → RedeCard
            if (lojas.length > 1 && codigoRede) {
              return (
                <RedeCard
                  key={codigoRede}
                  codigoRede={codigoRede}
                  redeSubrede={redeSubrede}
                  lojas={lojas}
                  expandedRede={expandedRedes.has(codigoRede)}
                  expandedLojas={expanded}
                  onToggleRede={() => toggleRede(codigoRede)}
                  onToggleLoja={toggleLoja}
                  onRebaixar={setFormItem}
                  onSolicitarRede={() => setFormRede({ codigoRede, redeSubrede, lojas })}
                />
              );
            }
            // Loja solo (sem rede ou rede com apenas 1 loja)
            const loja = lojas[0];
            return (
              <LojaCard
                key={loja.clienteCodigo}
                clienteCodigo={loja.clienteCodigo}
                clienteNome={loja.clienteNome}
                redeSubrede={loja.redeSubrede}
                itens={loja.itens}
                expanded={expanded.has(loja.clienteCodigo)}
                onToggle={() => toggleLoja(loja.clienteCodigo)}
                onRebaixar={setFormItem}
              />
            );
          })}
        </div>
      )}

      {formItem && (
        <RebaixaModal item={formItem} onClose={() => setFormItem(null)} onEnviado={handleEnviado} />
      )}

      {formRede && (
        <RedeRebaixaModal
          redeSubrede={formRede.redeSubrede}
          codigoRede={formRede.codigoRede}
          lojas={formRede.lojas}
          onClose={() => setFormRede(null)}
          onEnviado={handleEnviado}
        />
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
