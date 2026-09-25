"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { fmtData, fmtBRL } from "@/lib/utils";
import { STATUS_SHELF_MAP } from "@/lib/estoque";
import { TONE, toneMargem } from "@/lib/tones";
import { IcoX, IcoAlert, IcoStore } from "@/components/Icons";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

// Tipo de solicitacao sugerido pelo status de shelf do item (giro -> oferta interna)
const tipoDe = (it) => STATUS_SHELF_MAP[it.status]?.acao || "rebaixa";

// Mesmas formulas do RebaixaModal, em funcao pura para aplicar item a item.
function calcMargens({ precoPDV, precoOferta, sellout, precoUC }) {
  const p = Number(precoPDV);
  const o = Number(precoOferta);
  const s = Number(sellout) || 0;
  const margemPDV = p > 0 && precoUC != null ? ((p - precoUC) / p) * 100 : null;
  const margemOferta = o > 0 && precoUC != null ? ((o - (precoUC - s)) / o) * 100 : null;
  let selloutSugerido = null;
  if (o > 0 && precoUC != null && margemPDV != null) {
    const sug = precoUC - o * (1 - margemPDV / 100);
    if (sug > 0) selloutSugerido = Math.round(sug * 100) / 100;
  }
  return { margemPDV, margemOferta, selloutSugerido };
}

function MargemMini({ label, pct }) {
  const t = TONE[toneMargem(pct)];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[11px] font-medium tabular-nums ${t.bg} ${t.text} ${t.border}`}>
      {label} <b>{pct == null ? "—" : `${pct.toFixed(1)}%`}</b>
    </span>
  );
}

export default function RebaixaLoteModal({ itens, onClose, onEnviado }) {
  const [motivo, setMotivo] = useState("");
  const [inicioAcao, setInicioAcao] = useState("");
  const [fimAcao, setFimAcao] = useState("");
  const [campos, setCampos] = useState({});           // _id -> { precoPDV, precoOferta, sellout }
  const [ultimaCompra, setUltimaCompra] = useState({}); // _id -> { encontrado, precoUltimaCompra, dataUltimaCompra }
  const [loadingUC, setLoadingUC] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const lojas = useMemo(() => {
    const m = new Map();
    for (const it of itens) {
      let l = m.get(it.clienteCodigo);
      if (!l) {
        l = { clienteCodigo: it.clienteCodigo, cliente: it.cliente, codigoRede: it.codigoRede || null, redeSubrede: it.redeSubrede || null, itens: [] };
        m.set(it.clienteCodigo, l);
      }
      l.itens.push(it);
    }
    return [...m.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
  }, [itens]);

  useEffect(() => {
    let cancelado = false;
    setLoadingUC(true);
    Promise.all(
      itens.map((it) =>
        api.get("/erp/ultima-compra", { params: { clienteCodigo: it.clienteCodigo, produtoCodigo: it.produtoCodigo } })
          .then(({ data }) => [it._id, data])
          .catch(() => [it._id, { encontrado: false }])
      )
    ).then((pares) => {
      if (cancelado) return;
      setUltimaCompra(Object.fromEntries(pares));
      setLoadingUC(false);
    });
    return () => { cancelado = true; };
  }, [itens]);

  const setCampo = (id, k, v) => setCampos((c) => ({ ...c, [id]: { ...(c[id] || {}), [k]: v } }));

  function dadosItem(it) {
    const c = campos[it._id] || {};
    const uc = ultimaCompra[it._id];
    const precoUC = uc?.encontrado ? Number(uc.precoUltimaCompra) : null;
    const dataUC = uc?.encontrado ? uc.dataUltimaCompra : null;
    return { c, precoUC, dataUC, ...calcMargens({ ...c, precoUC }) };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!inicioAcao || !fimAcao) { setErro("Informe o período da ação (início e fim)"); return; }
    if (new Date(fimAcao) < new Date(inicioAcao)) { setErro("Fim da ação não pode ser anterior ao início"); return; }
    const faltando = itens.find((it) => {
      const c = campos[it._id] || {};
      return !(Number(c.precoPDV) > 0) || !(Number(c.precoOferta) > 0);
    });
    if (faltando) { setErro(`Informe preço PDV e preço da oferta de "${faltando.produto}" (${faltando.cliente})`); return; }

    setEnviando(true);
    try {
      // Uma solicitacao por loja+produto: o resto do app (lista de solicitacoes,
      // agrupamento por rede, badges de acao ativa) assume um produto por solicitacao.
      await Promise.all(
        itens.map((it) => {
          const d = dadosItem(it);
          return api.post("/solicitacoes", {
            tipo: tipoDe(it),
            cliente: it.cliente,
            clienteCodigo: it.clienteCodigo,
            codigoRede: it.codigoRede || null,
            redeSubrede: it.redeSubrede || null,
            motivo,
            inicioAcao,
            fimAcao,
            itens: [{
              produto: it.produto,
              produtoCodigo: it.produtoCodigo,
              quantidade: it.quantidade,
              dataValidade: it.dataValidade,
              diasParaVencer: it.diasParaVencer,
              precoTabela: it.precoTabela,
              precoOferta: Number(d.c.precoOferta),
              precoPDV: Number(d.c.precoPDV),
              sellout: d.c.sellout ? Number(d.c.sellout) : 0,
              precoUltimaCompra: d.precoUC ?? undefined,
              dataUltimaCompra: d.dataUC ?? undefined,
              margemPDV: d.margemPDV != null ? Math.round(d.margemPDV * 10) / 10 : undefined,
              margemOferta: d.margemOferta != null ? Math.round(d.margemOferta * 10) / 10 : undefined,
              estoqueRefId: it._id,
            }],
          });
        })
      );
      onEnviado(itens.length);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao criar solicitações");
    } finally {
      setEnviando(false);
    }
  }

  const semHistorico = !loadingUC && itens.filter((it) => !ultimaCompra[it._id]?.encontrado).length;
  const nOfertas = itens.filter((it) => tipoDe(it) === "oferta_interna").length;
  const nRebaixas = itens.length - nOfertas;
  const rotuloEnviar = nOfertas && nRebaixas
    ? `Criar ${itens.length} solicitações (${nRebaixas} ${nRebaixas === 1 ? "rebaixa" : "rebaixas"} · ${nOfertas} ${nOfertas === 1 ? "oferta" : "ofertas"})`
    : nOfertas
      ? `Criar ${nOfertas} ${nOfertas === 1 ? "oferta interna" : "ofertas internas"}`
      : `Criar ${nRebaixas} ${nRebaixas === 1 ? "rebaixa" : "rebaixas"}`;

  return (
    <Dialog open onClose={onClose} sheet size="lg" ariaLabel="Rebaixa em lote">
        {/* Header fixo */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-neutral-200 bg-white sm:rounded-t-2xl safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-secondary uppercase tracking-wider mb-0.5">Rebaixa em lote</div>
              <h2 className="font-bold text-neutral-900 text-base leading-snug">
                {itens.length} {itens.length === 1 ? "item" : "itens"} · {lojas.length} {lojas.length === 1 ? "loja" : "lojas"}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full bg-neutral-100 active:bg-neutral-200 active:scale-95 transition flex items-center justify-center text-neutral-600">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          <form id="form-rebaixa-lote" onSubmit={handleSubmit} className="space-y-4">
            {/* Campos comuns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Motivo (vale para todas)</label>
                <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Produto próximo ao vencimento" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Início *</label>
                <input type="date" className="input" value={inicioAcao} onChange={(e) => setInicioAcao(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Fim *</label>
                <input type="date" className="input" value={fimAcao} onChange={(e) => setFimAcao(e.target.value)} required />
              </div>
            </div>

            {semHistorico > 0 && (
              <div className="rounded-xl bg-warning/10 border border-warning/30 p-2.5 text-[11px] text-warning flex items-start gap-2">
                <IcoAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{semHistorico} {semHistorico === 1 ? "item sem" : "itens sem"} histórico de compra — as margens desses não serão calculadas.</span>
              </div>
            )}

            {/* Itens agrupados por loja */}
            {lojas.map((loja) => (
              <div key={loja.clienteCodigo} className="surface overflow-hidden">
                <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 border-b border-neutral-100">
                  <IcoStore className="w-4 h-4 text-neutral-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-800 truncate">{loja.cliente}</div>
                    {loja.redeSubrede && <div className="text-[10px] text-neutral-400 truncate">{loja.redeSubrede}</div>}
                  </div>
                  <span className="ml-auto text-xs text-neutral-400 whitespace-nowrap">{loja.itens.length} {loja.itens.length === 1 ? "item" : "itens"}</span>
                </div>

                <div className="divide-y divide-neutral-100">
                  {loja.itens.map((it) => {
                    const d = dadosItem(it);
                    const ucCarregando = loadingUC && ultimaCompra[it._id] === undefined;
                    return (
                      <div key={it._id} className="px-3 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-medium text-neutral-800 leading-snug">{it.produto}</div>
                              <Badge tone={tipoDe(it) === "oferta_interna" ? "info" : "danger"} className="text-[10px] font-semibold">
                                {tipoDe(it) === "oferta_interna" ? "Oferta" : "Rebaixa"}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">
                              {it.quantidade} un · vence {fmtData(it.dataValidade)}
                              <span className={`font-semibold ${it.diasParaVencer <= 15 ? "text-danger" : "text-neutral-500"}`}> ({it.diasParaVencer ?? "—"}d)</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-[11px]">
                            <div className="text-neutral-400 uppercase tracking-wide text-[9px] font-semibold">Últ. compra</div>
                            {ucCarregando ? (
                              <div className="text-neutral-400">…</div>
                            ) : d.precoUC != null ? (
                              <>
                                <div className="font-bold text-secondary">{fmtBRL(d.precoUC)}</div>
                                <div className="text-neutral-400">{fmtData(d.dataUC)}</div>
                              </>
                            ) : (
                              <div className="text-neutral-400">Sem histórico</div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[9px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">PDV (R$) *</label>
                            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" className="input !px-2.5 !py-2 text-sm"
                              value={d.c.precoPDV || ""} onChange={(e) => setCampo(it._id, "precoPDV", e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">Oferta (R$) *</label>
                            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" className="input !px-2.5 !py-2 text-sm font-bold"
                              value={d.c.precoOferta || ""} onChange={(e) => setCampo(it._id, "precoOferta", e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">Sellout (R$)</label>
                            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" className="input !px-2.5 !py-2 text-sm"
                              value={d.c.sellout || ""} onChange={(e) => setCampo(it._id, "sellout", e.target.value)} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <MargemMini label="Margem PDV" pct={d.margemPDV} />
                          <MargemMini label="Margem oferta" pct={d.margemOferta} />
                          {d.selloutSugerido != null && String(d.c.sellout || "") !== String(d.selloutSugerido) && (
                            <button type="button" onClick={() => setCampo(it._id, "sellout", String(d.selloutSugerido))}
                              className="text-[11px] text-info font-semibold hover:text-info active:opacity-70 transition">
                              ↑ Sellout sugerido {fmtBRL(d.selloutSugerido)}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {erro && (
              <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-sm text-danger flex items-center gap-2 animate-fade-in">
                <IcoAlert className="w-4 h-4 shrink-0" />
                {erro}
              </div>
            )}
          </form>
        </div>

        {/* Footer fixo */}
        <div className="shrink-0 px-4 py-3 border-t border-neutral-100 bg-white sm:rounded-b-3xl">
          <Button type="submit" form="form-rebaixa-lote" size="lg" className="w-full" disabled={enviando}>
            {enviando ? "Enviando..." : rotuloEnviar}
          </Button>
        </div>
    </Dialog>
  );
}
