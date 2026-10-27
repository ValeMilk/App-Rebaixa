"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { fmtData, fmtBRL } from "@/lib/utils";
import { TONE, toneMargem } from "@/lib/tones";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { calcMargens, selloutSugeridoPDV, ofertaDoContexto, resolverSellout, camposUltimaCompra, camposPrecificacao, carregarContexto } from "@/lib/precificacao";
import { IcoX, IcoUsers, IcoAlert } from "@/components/Icons";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import UltimaCompraComDesconto from "@/components/UltimaCompraComDesconto";
import PrecosInfo, { SeloPrecoOferta } from "@/components/precificacao/PrecosInfo";
import SelloutCampo from "@/components/precificacao/SelloutCampo";
import FotoCaptura from "@/components/precificacao/FotoCaptura";

export function MargemBadge({ pct }) {
  if (pct == null) return <span className="text-base font-semibold text-neutral-300">—</span>;
  const t = TONE[toneMargem(pct)];
  return (
    <span className={`inline-block rounded-lg border px-3 py-0.5 text-xl font-semibold tabular-nums ${t.bg} ${t.text} ${t.border}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

/**
 * Solicitacao de rebaixa / oferta interna para UMA loja (v2.0):
 * - contexto de precificacao (ultima compra, desconto, Tabela 70/minimo, P#2/P#3 da rede ou do item)
 * - preco da oferta travado quando a rede tem P#2/P#3; senao preenchido pelo item ou livre
 * - sellout: automatico (margem da rede) ou sugerido pela margem do PDV; so quem ve margens digita
 * - foto obrigatoria quando a acao combate um concorrente
 */
export default function RebaixaModal({ item, onClose, onEnviado, tipo = "rebaixa" }) {
  const isOferta = tipo === "oferta_interna";
  const { user } = useAuth();
  const veMargens = pode(user, "solicitacoes.ver_margens");

  const [precoOferta, setPrecoOferta] = useState("");
  const [precoPDV, setPrecoPDV] = useState("");
  const [sellout, setSellout] = useState("");
  const [motivo, setMotivo] = useState("");
  const [inicioAcao, setInicioAcao] = useState("");
  const [fimAcao, setFimAcao] = useState("");
  const [contraConcorrente, setContraConcorrente] = useState(false);
  const [foto, setFoto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const [ctx, setCtx] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoadingCtx(true);
    carregarContexto(api, { clienteCodigo: item.clienteCodigo, produtoCodigo: item.produtoCodigo, codigoRede: item.codigoRede || undefined, tipo })
      .then((c) => {
        if (cancelado) return;
        setCtx(c);
        const of = ofertaDoContexto(c, tipo).precoOferta;
        if (of?.valor != null) setPrecoOferta(String(of.valor));
      })
      .finally(() => { if (!cancelado) setLoadingCtx(false); });
    return () => { cancelado = true; };
  }, [item.clienteCodigo, item.produtoCodigo, item.codigoRede, tipo]);

  const ultimaCompra = ctx?.ultimaCompra;
  const precoUC = ultimaCompra?.encontrado ? Number(ultimaCompra.precoUltimaCompra) : null;
  const dataUC  = ultimaCompra?.encontrado ? ultimaCompra.dataUltimaCompra : null;
  const descUC  = camposUltimaCompra(ctx);
  const oferta  = ofertaDoContexto(ctx, tipo);

  const { margemPDV } = useMemo(() => calcMargens({ precoPDV, precoOferta, sellout: 0, precoUC }), [precoPDV, precoOferta, precoUC]);
  const sugPDV = useMemo(() => selloutSugeridoPDV({ precoUC, precoPDV, precoOferta }), [precoUC, precoPDV, precoOferta]);
  const selloutEfetivo = useMemo(
    () => resolverSellout({ oferta: oferta.precoOferta, selloutAutomatico: oferta.selloutAutomatico, veMargens, selloutDigitado: sellout, precoUC, precoPDV, precoOferta }),
    [oferta, veMargens, sellout, precoUC, precoPDV, precoOferta]
  );
  const { margemOferta } = useMemo(() => calcMargens({ precoPDV, precoOferta, sellout: selloutEfetivo.valor, precoUC }), [precoPDV, precoOferta, selloutEfetivo, precoUC]);
  const valorRecebido = ctx?.precoLiquido != null ? ctx.precoLiquido - (selloutEfetivo.valor || 0) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!precoOferta) { setErro("Informe o preço da oferta"); return; }
    if (!precoPDV)    { setErro("Informe o preço PDV"); return; }
    if (!inicioAcao || !fimAcao) { setErro("Informe o período da ação (início e fim)"); return; }
    if (new Date(fimAcao) < new Date(inicioAcao)) { setErro("Fim da ação não pode ser anterior ao início"); return; }
    if (contraConcorrente && !foto) { setErro("Ação contra concorrente exige a foto tirada na hora"); return; }
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
        contraConcorrente,
        foto: foto || undefined,
        itens: [{
          produto: item.produto,
          produtoCodigo: item.produtoCodigo,
          quantidade: item.quantidade,
          dataValidade: item.dataValidade,
          diasParaVencer: item.diasParaVencer,
          precoTabela: ctx?.precoTabela ?? item.precoTabela,
          precoOferta: Number(precoOferta),
          precoPDV: Number(precoPDV),
          ...descUC,
          margemPDV:    margemPDV    != null ? Math.round(margemPDV    * 10) / 10 : undefined,
          margemOferta: margemOferta != null ? Math.round(margemOferta * 10) / 10 : undefined,
          ...camposPrecificacao(ctx, { tipo, precoOferta, sellout: selloutEfetivo.valor, selloutOrigem: selloutEfetivo.origem }),
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
    <Dialog open onClose={onClose} sheet size="md" ariaLabel={isOferta ? "Nova oferta interna" : "Nova rebaixa"}>
        {/* Header fixo */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-neutral-200 bg-white sm:rounded-t-2xl safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-secondary uppercase tracking-wider mb-0.5">{isOferta ? "Nova Oferta Interna" : "Nova Rebaixa"}</div>
              <h2 className="font-bold text-neutral-900 text-base leading-snug line-clamp-2">{item.produto}</h2>
            </div>
            <button onClick={onClose} aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full bg-neutral-100 active:bg-neutral-200 active:scale-95 transition flex items-center justify-center text-neutral-600">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          {/* Cliente + Rede */}
          <div className="mb-3 bg-neutral-50 rounded-xl border border-neutral-100 px-3 py-2">
            <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Cliente</div>
            <div className="text-sm font-semibold text-neutral-800 truncate">{item.cliente}</div>
            {item.redeSubrede && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-info font-semibold">
                <IcoUsers className="w-3 h-3" />
                <span className="truncate">{item.redeSubrede}</span>
              </div>
            )}
          </div>

          {/* Info strip horizontal: Qtd · Vence · Última Compra */}
          <div className="flex items-stretch rounded-xl border border-neutral-100 overflow-hidden mb-2">
            <div className="flex-1 bg-white px-2 py-2 text-center">
              <div className="text-[9px] text-neutral-500 font-semibold uppercase tracking-wide">Qtd</div>
              <div className="font-bold text-neutral-800 text-lg leading-tight">{item.quantidade}</div>
            </div>
            <div className="flex-1 bg-white px-2 py-2 text-center border-x border-neutral-100">
              <div className="text-[9px] text-neutral-500 font-semibold uppercase tracking-wide">Vence</div>
              <div className={`font-bold text-lg leading-tight ${item.diasParaVencer <= 15 ? "text-danger" : "text-neutral-800"}`}>
                {item.diasParaVencer ?? "—"}d
              </div>
              <div className="text-[9px] text-neutral-400">{fmtData(item.dataValidade)}</div>
            </div>
            <div className="flex-1 bg-secondary/5 px-2 py-2 text-center">
              <div className="text-[9px] text-secondary/70 font-semibold uppercase tracking-wide">Últ. Compra</div>
              {loadingCtx ? (
                <div className="text-neutral-400 text-xs mt-1">…</div>
              ) : precoUC != null ? (
                <>
                  <div className="font-bold text-secondary text-sm leading-tight mt-0.5">{fmtBRL(precoUC)}</div>
                  <div className="text-[9px] text-neutral-400">{fmtData(dataUC)}</div>
                  {ultimaCompra?.origem === "rede" && (
                    <div className="text-[9px] text-info font-semibold leading-tight">da rede</div>
                  )}
                </>
              ) : (
                <div className="text-neutral-400 text-xs mt-1">Sem histórico</div>
              )}
            </div>
          </div>

          {/* Tabela 70 · mínimo · desconto do cliente · preço líquido */}
          {!loadingCtx && ctx && <PrecosInfo ctx={ctx} className="mb-2" />}

          {!loadingCtx && ultimaCompra?.origem === "rede" && (
            <div className="mb-2 text-[10px] text-neutral-500 px-1">
              A loja não compra em nome próprio no Lacteus: preço da compra mais recente de outra loja da rede.
            </div>
          )}

          {/* Última compra com desconto de contrato diluído (informativo) */}
          {precoUC != null && descUC.descontoContratoPercentual != null && (
            <div className="mb-3 rounded-xl border border-secondary/15 bg-secondary/5 px-3 py-1.5">
              <UltimaCompraComDesconto
                align="center"
                preco={descUC.precoUltimaCompraComDesconto}
                percentual={descUC.descontoContratoPercentual}
                tipo={descUC.descontoContratoTipo}
              />
            </div>
          )}

          {!loadingCtx && precoUC == null && (
            <div className="mb-3 rounded-xl bg-warning/10 border border-warning/30 p-2.5 text-[11px] text-warning flex items-start gap-2">
              <IcoAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Loja sem histórico de compra deste produto: sem preço líquido{veMargens ? " e sem margens" : ""}. A solicitação pode ser enviada mesmo assim.</span>
            </div>
          )}

          <form id="form-rebaixa" onSubmit={handleSubmit} className="space-y-2.5">
            {/* Preço PDV */}
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Preço PDV (R$) *</label>
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

            {/* Margem PDV (so quem ve margens) */}
            {veMargens && (
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-3 py-2 border border-neutral-100">
                <div>
                  <div className="text-xs font-semibold text-neutral-700">Margem PDV</div>
                  <div className="text-[10px] text-neutral-400">(PDV − Últ. Compra) / PDV</div>
                </div>
                <MargemBadge pct={margemPDV} />
              </div>
            )}

            {/* Preço Oferta */}
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Preço da Oferta (R$) *</label>
                <SeloPrecoOferta oferta={oferta.precoOferta} />
              </div>
              <input
                type="number" step="0.01" min="0"
                className={`input text-2xl font-bold py-2 ${oferta.precoOferta?.travado ? "bg-neutral-50 text-neutral-700" : ""}`}
                value={precoOferta}
                onChange={(e) => setPrecoOferta(e.target.value)}
                placeholder={loadingCtx ? "…" : "0,00"}
                inputMode="decimal"
                readOnly={!!oferta.precoOferta?.travado}
                required
              />
              {!loadingCtx && !oferta.precoOferta?.rotulo && (
                <div className="mt-1 text-[10px] text-neutral-400">Rede sem preço cadastrado: sugira o preço da oferta.</div>
              )}
            </div>

            {/* Sellout: so quem ve margens digita; para o vendedor e calculado em silencio */}
            <SelloutCampo
              veMargens={veMargens}
              value={sellout}
              onChange={setSellout}
              selloutAutomatico={oferta.precoOferta?.travado ? oferta.selloutAutomatico : null}
              margemRede={ctx?.margemRede?.margem}
              selloutSugeridoPDV={sugPDV}
              margemPDV={margemPDV}
            />

            {/* Margem Oferta + valor recebido (so quem ve margens) */}
            {veMargens && (
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-3 py-2 border border-neutral-100">
                <div>
                  <div className="text-xs font-semibold text-neutral-700">Margem Oferta</div>
                  <div className="text-[10px] text-neutral-400">(Oferta − (Últ. Compra − Sellout)) / Oferta</div>
                  {valorRecebido != null && (
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      Valemilk recebe <b className="text-neutral-700">{fmtBRL(valorRecebido)}</b>
                      {ctx?.piso?.valor != null && (
                        <span className={valorRecebido < ctx.piso.valor && !oferta.precoOferta?.travado ? " text-danger" : " text-success"}>
                          {" "}· piso {fmtBRL(ctx.piso.valor)}{valorRecebido < ctx.piso.valor && !oferta.precoOferta?.travado ? " (sobe para a diretoria)" : ""}
                        </span>
                      )}
                      {selloutEfetivo.origem === "automatico" && <span className="text-success"> · sellout automático</span>}
                    </div>
                  )}
                </div>
                <MargemBadge pct={margemOferta} />
              </div>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Motivo</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produto próximo ao vencimento"
              />
            </div>

            {/* Contra concorrente + foto */}
            <label className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700">
              <input type="checkbox" className="h-4 w-4" checked={contraConcorrente} onChange={(e) => setContraConcorrente(e.target.checked)} />
              Ação contra concorrente (exige foto)
            </label>
            <FotoCaptura value={foto} onChange={setFoto} obrigatoria={contraConcorrente} />

            {/* Período da ação */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Início *</label>
                <input type="date" className="input" value={inicioAcao} onChange={(e) => setInicioAcao(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Fim *</label>
                <input type="date" className="input" value={fimAcao} onChange={(e) => setFimAcao(e.target.value)} required />
              </div>
            </div>

            {erro && (
              <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-sm text-danger flex items-center gap-2 animate-fade-in">
                <IcoAlert className="w-4 h-4 shrink-0" />
                {erro}
              </div>
            )}
          </form>
        </div>

        {/* Footer fixo com botão */}
        <div className="shrink-0 px-4 py-3 border-t border-neutral-200 bg-white sm:rounded-b-2xl">
          <Button type="submit" form="form-rebaixa" size="lg" className="w-full" disabled={enviando || loadingCtx}>
            {enviando ? "Enviando..." : isOferta ? "Solicitar Oferta" : "Solicitar Rebaixa"}
          </Button>
        </div>
    </Dialog>
  );
}
