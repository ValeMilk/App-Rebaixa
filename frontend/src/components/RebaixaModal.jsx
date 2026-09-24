"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { fmtData, fmtBRL } from "@/lib/utils";
import { IcoX, IcoUsers, IcoAlert } from "@/components/Icons";

export function MargemBadge({ pct }) {
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

export default function RebaixaModal({ item, onClose, onEnviado, tipo = "rebaixa" }) {
  const isOferta = tipo === "oferta_interna";
  const [precoOferta, setPrecoOferta] = useState("");
  const [precoPDV, setPrecoPDV] = useState("");
  const [sellout, setSellout] = useState("");
  const [motivo, setMotivo] = useState("");
  const [inicioAcao, setInicioAcao] = useState("");
  const [fimAcao, setFimAcao] = useState("");
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
    if (!inicioAcao || !fimAcao) { setErro("Informe o período da ação (início e fim)"); return; }
    if (new Date(fimAcao) < new Date(inicioAcao)) { setErro("Fim da ação não pode ser anterior ao início"); return; }
    setEnviando(true);
    try {
      await api.post("/solicitacoes", {
        tipo,
        cliente: item.cliente,
        clienteCodigo: item.clienteCodigo,
        codigoRede: item.codigoRede || null,
        redeSubrede: item.redeSubrede || null,
        motivo,
        inicioAcao,
        fimAcao,
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
              <div className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-0.5">{isOferta ? "Nova Oferta Interna" : "Nova Rebaixa"}</div>
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

            {/* Período da ação */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Início *</label>
                <input type="date" className="input" value={inicioAcao} onChange={(e) => setInicioAcao(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Fim *</label>
                <input type="date" className="input" value={fimAcao} onChange={(e) => setFimAcao(e.target.value)} required />
              </div>
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
            {enviando ? "Enviando..." : isOferta ? "Solicitar Oferta" : "Solicitar Rebaixa"}
          </button>
        </div>
      </div>
    </div>
  );
}
