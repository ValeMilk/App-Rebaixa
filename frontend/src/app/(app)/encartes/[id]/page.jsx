"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import {
  IcoChevronRight,
  IcoX,
  IcoSearch,
  IcoCalendar,
  IcoTag,
  IcoPackage,
  IcoTrash,
} from "@/components/Icons";

// IcoTrash pode nao existir â€” fallback inline
function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function fmtBRL(v) {
  if (v == null || v === "") return "â€”";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MargemBadge({ pct }) {
  if (pct == null) return <span className="text-slate-300 text-base font-bold">â€”</span>;
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

/** Modal para adicionar produtos ao encarte (por subcategoria) */
function AdicionarProdutoModal({ encarteId, codigoRede, onClose, onAdicionado }) {
  // Subcategoria + lista
  const [subcategorias, setSubcategorias] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [subcategoriaSel, setSubcategoriaSel] = useState("");
  const [q, setQ] = useState("");
  const [produtos, setProdutos] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);

  // NegociaÃ§Ã£o para a subcategoria inteira
  const [precoPDV, setPrecoPDV] = useState("");
  const [precoOferta, setPrecoOferta] = useState("");
  const [sellout, setSellout] = useState("");

  // Produtos desmarcados (por _id)
  const [desmarcados, setDesmarcados] = useState(new Set());

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  // Carrega subcategorias ao abrir
  useEffect(() => {
    api.get("/encartes/subcategorias")
      .then(({ data }) => setSubcategorias(data.subcategorias || []))
      .catch(() => setSubcategorias([]))
      .finally(() => setLoadingSubs(false));
  }, []);

  // Carrega produtos quando subcategoria mudar ou q mudar
  useEffect(() => {
    if (!subcategoriaSel) { setProdutos([]); return; }
    const t = setTimeout(async () => {
      setLoadingProdutos(true);
      try {
        const params = { subcategoria: subcategoriaSel, limit: 500 };
        if (q.trim().length >= 2) params.q = q.trim();
        const { data } = await api.get("/encartes/produtos", { params });
        setProdutos(data.produtos || []);
      } catch { setProdutos([]); }
      finally { setLoadingProdutos(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [subcategoriaSel, q]);

  function toggleProduto(id) {
    setDesmarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const produtosSelecionados = useMemo(
    () => produtos.filter((p) => !desmarcados.has(p._id)),
    [produtos, desmarcados]
  );

  const todosMarcados = produtos.length > 0 && produtosSelecionados.length === produtos.length;
  function toggleTodos() {
    if (todosMarcados) setDesmarcados(new Set(produtos.map((p) => p._id)));
    else setDesmarcados(new Set());
  }

  // Custo Promo preview (sem UC ainda, mostrado por produto após salvar)

  async function handleSalvar() {
    setErro("");
    if (!subcategoriaSel) { setErro("Selecione uma subcategoria"); return; }
    if (!precoPDV)        { setErro("Informe o PreÃ§o PDV"); return; }
    if (!precoOferta)     { setErro("Informe o PreÃ§o Oferta"); return; }
    if (produtosSelecionados.length === 0) { setErro("Selecione pelo menos um produto"); return; }

    setSalvando(true);
    setProgresso({ feitos: 0, total: produtosSelecionados.length });

    const pdvNum     = Number(precoPDV);
    const ofertaNum  = Number(precoOferta);
    const selloutNum = Number(sellout) || 0;

    let ultimoEncarte = null;
    let erros = 0;

    // Processa em batches de 4 para nÃ£o saturar o ERP
    const lote = 4;
    for (let i = 0; i < produtosSelecionados.length; i += lote) {
      const batch = produtosSelecionados.slice(i, i + lote);
      const results = await Promise.allSettled(batch.map(async (p) => {
        let precoUC = null;
        let dataUC = null;
        try {
          const { data: uc } = await api.post("/erp/ultima-compra-rede", {
            produtoCodigo: p.codigoLivre || p.codigo,
            codigoRede,
          });
          if (uc?.encontrado) {
            precoUC = Number(uc.precoUltimaCompra);
            dataUC  = uc.dataUltimaCompra;
          }
        } catch { /* segue sem UC */ }

        const margemPDV    = precoUC != null ? Math.round((((pdvNum - precoUC) / pdvNum) * 100) * 10) / 10 : null;
        const custoPromo   = precoUC != null ? precoUC - selloutNum : null;
        const margemOferta = custoPromo != null ? Math.round((((ofertaNum - custoPromo) / ofertaNum) * 100) * 10) / 10 : null;

        const { data } = await api.post(`/encartes/${encarteId}/itens`, {
          produtoCodigo:     p.codigoLivre || p.codigo,
          produto:           p.descricao,
          precoTabela:       p.precoTabela,
          precoMinimo:       p.precoMinimo,
          precoPromo:        p.precoPromo,
          custo:             p.custo,
          precoUltimaCompra: precoUC,
          dataUltimaCompra:  dataUC,
          precoOferta:       ofertaNum,
          precoPDV:          pdvNum,
          sellout:           selloutNum,
          margemPDV,
          margemOferta,
        });
        return data;
      }));

      for (const r of results) {
        if (r.status === "fulfilled") ultimoEncarte = r.value;
        else erros += 1;
      }
      setProgresso({ feitos: Math.min(i + lote, produtosSelecionados.length), total: produtosSelecionados.length });
    }

    setSalvando(false);
    if (ultimoEncarte) onAdicionado(ultimoEncarte);
    if (erros > 0) {
      setErro(`${erros} produto(s) falharam ao adicionar`);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={salvando ? undefined : onClose} />
      <div className="relative bg-white shadow-2xl flex flex-col w-full sm:max-w-md sm:rounded-3xl sm:max-h-[90dvh] animate-slide-up safe-area-pb"
        style={{ height: "100dvh", maxHeight: "100dvh" }}>

        {/* Header */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-slate-100 bg-white sm:rounded-t-3xl safe-area-pt">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-0.5">
                Precificar para Encarte
              </div>
              <h2 className="font-bold text-slate-900 text-base leading-snug">
                {subcategoriaSel || "Selecione uma subcategoria"}
              </h2>
            </div>
            <button onClick={onClose} disabled={salvando} aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full bg-slate-100 active:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600 disabled:opacity-50">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          <div className="space-y-3">

            {/* Dropdown subcategoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Subcategoria
              </label>
              {loadingSubs ? (
                <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand animate-spin" />
                  Carregando...
                </div>
              ) : (
                <select
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/40"
                  value={subcategoriaSel}
                  onChange={(e) => { setSubcategoriaSel(e.target.value); setQ(""); setDesmarcados(new Set()); }}>
                  <option value="">Selecione uma subcategoria...</option>
                  {subcategorias.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Margem PDV */}
            {subcategoriaSel && (
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Margem PDV</span>
                  <span className="text-slate-300 text-base font-bold">—</span>
                </div>
                <div className="text-[10px] text-slate-400 mb-2">(PDV − Últ. Compra) / PDV · calculada por produto</div>
                <label className="block text-xs text-slate-500 mb-1">Preço PDV (R$)</label>
                <input type="number" inputMode="decimal" step="0.01"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                  placeholder="0,00" value={precoPDV} onChange={(e) => setPrecoPDV(e.target.value)} />
              </div>
            )}

            {/* Margem Oferta */}
            {subcategoriaSel && (
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Margem Oferta</span>
                  <span className="text-slate-300 text-base font-bold">—</span>
                </div>
                <div className="text-[10px] text-slate-400 -mt-1">(Oferta − Custo Promo) / Oferta · calculada por produto</div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Preço oferta (encarte)</label>
                  <input type="number" inputMode="decimal" step="0.01"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                    placeholder="0,00" value={precoOferta} onChange={(e) => setPrecoOferta(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Sellout</label>
                  <input type="number" inputMode="decimal" step="0.01"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                    placeholder="0,00" value={sellout} onChange={(e) => setSellout(e.target.value)} />
                </div>
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold text-emerald-700">Custo Promo</div>
                    <div className="text-[10px] text-slate-400">Últ. Compra − Sellout · por produto</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">Calculado ao salvar</span>
                </div>
              </div>
            )}

            {/* Filtro */}
            {subcategoriaSel && (
              <div className="relative">
                <IcoSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                  placeholder="Filtrar por nome..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}

            {/* CabeÃ§alho com contagem + select all */}
            {subcategoriaSel && produtos.length > 0 && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-500">
                  <span className="font-bold text-brand">{produtosSelecionados.length}</span> de {produtos.length} selecionados
                </span>
                <button type="button" onClick={toggleTodos} className="text-brand font-semibold">
                  {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </div>
            )}

            {loadingProdutos && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
              </div>
            )}

            {!loadingProdutos && subcategoriaSel && produtos.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-6">Nenhum produto encontrado</p>
            )}

            {!subcategoriaSel && (
              <p className="text-center text-slate-400 text-sm py-6">Selecione uma subcategoria para ver os produtos</p>
            )}

            {/* Lista de produtos com checkbox */}
            <ul className="divide-y divide-slate-50">
              {produtos.map((p) => {
                const marcado = !desmarcados.has(p._id);
                return (
                  <li key={p._id}>
                    <button
                      type="button"
                      onClick={() => toggleProduto(p._id)}
                      className={`w-full flex items-center gap-3 py-3 text-left transition rounded-xl px-2 ${marcado ? "" : "opacity-50"} hover:bg-slate-50`}
                    >
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${marcado ? "bg-brand border-brand" : "bg-white border-slate-300"}`}>
                        {marcado && (
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">{p.descricao}</div>
                        <div className="text-xs text-slate-400">CÃ³d {p.codigoLivre || p.codigo}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-slate-700">{fmtBRL(p.precoTabela)}</div>
                        <div className="text-[10px] text-slate-400">tabela</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {erro && <p className="text-red-600 text-xs">{erro}</p>}
          </div>
        </div>

        {/* Footer */}
        {subcategoriaSel && produtos.length > 0 && (
          <div className="shrink-0 px-4 pb-4 pt-2 border-t border-slate-100 safe-area-pb">
            {salvando && progresso.total > 0 && (
              <div className="mb-2">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand transition-all" style={{ width: `${(progresso.feitos / progresso.total) * 100}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 text-center mt-1">
                  Adicionando {progresso.feitos} de {progresso.total}...
                </div>
              </div>
            )}
            <button
              onClick={handleSalvar}
              disabled={salvando || produtosSelecionados.length === 0}
              className="w-full py-3 rounded-2xl bg-brand text-white font-bold text-sm hover:opacity-90 active:scale-95 transition disabled:opacity-60">
              {salvando ? "Adicionando..." : `Adicionar ${produtosSelecionados.length} produto${produtosSelecionados.length === 1 ? "" : "s"} ao encarte`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EncarteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [encarte, setEncarte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/encartes/${id}`);
      setEncarte(data);
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao carregar encarte");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluirEncarte() {
    if (!confirm(`Excluir o encarte "${encarte.nome}"? Esta aÃ§Ã£o nÃ£o pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await api.delete(`/encartes/${id}`);
      router.back();
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao excluir encarte");
      setExcluindo(false);
    }
  }

  async function removerItem(itemId) {
    if (!confirm("Remover produto do encarte?")) return;
    setRemovendoId(itemId);
    try {
      const { data } = await api.delete(`/encartes/${id}/itens/${itemId}`);
      setEncarte(data);
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao remover item");
    } finally {
      setRemovendoId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
      </div>
    );
  }

  if (erro || !encarte) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600 font-semibold">{erro || "Encarte nÃ£o encontrado"}</p>
          <button onClick={() => router.back()} className="mt-3 text-brand text-sm underline">Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 safe-area-pt">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition shrink-0">
            <IcoChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
              <span className="truncate">{encarte.redeSubrede || encarte.codigoRede}</span>
            </div>
            <h1 className="font-bold text-slate-900 text-base leading-tight truncate">{encarte.nome}</h1>
          </div>
          {encarte.podeEditar ? (
            <button
              onClick={excluirEncarte}
              disabled={excluindo}
              className="shrink-0 h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition disabled:opacity-40">
              <TrashIcon className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-1 rounded-full shrink-0">
              VisualizaÃ§Ã£o
            </span>
          )}
        </div>

        {/* PerÃ­odo */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
          <IcoCalendar className="w-3.5 h-3.5 shrink-0" />
          <span>{fmtData(encarte.periodoInicio)} â†’ {fmtData(encarte.periodoFim)}</span>
        </div>
      </div>

      {/* SumÃ¡rio */}
      <div className="bg-white border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <IcoTag className="w-3.5 h-3.5" />
          <span><span className="font-bold text-slate-800">{encarte.itens.length}</span> produto{encarte.itens.length !== 1 ? "s" : ""} neste encarte</span>
        </div>
      </div>

      {/* Lista de itens */}
        <div className="flex-1 p-4 pb-36 lg:pb-28 space-y-2.5">
        {encarte.itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <IcoPackage className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold">Nenhum produto ainda</p>
            <p className="text-slate-400 text-sm mt-1">
              {encarte.podeEditar ? 'Toque em "+ Adicionar Produto" para montar o encarte.' : "O responsÃ¡vel ainda nÃ£o adicionou produtos."}
            </p>
          </div>
        ) : (
          encarte.itens.map((it) => (
            <div key={it._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800 text-sm leading-snug">{it.produto}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">CÃ³d {it.produtoCodigo || "â€”"}</div>
                </div>
                {encarte.podeEditar && (
                  <button
                    onClick={() => removerItem(String(it._id))}
                    disabled={removendoId === String(it._id)}
                    className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition disabled:opacity-40 shrink-0">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* PreÃ§os em grid */}
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Ãšltima compra</div>
                  <div className="text-sm font-bold text-brand">{fmtBRL(it.precoUltimaCompra)}</div>
                  {it.dataUltimaCompra && (
                    <div className="text-[10px] text-slate-400">{fmtData(it.dataUltimaCompra)}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">PreÃ§o PDV</div>
                  <div className="text-sm font-semibold text-slate-800">{fmtBRL(it.precoPDV)}</div>
                  {it.margemPDV != null && (
                    <div className={`text-[10px] font-bold ${it.margemPDV >= 20 ? "text-emerald-600" : it.margemPDV >= 10 ? "text-amber-600" : "text-red-600"}`}>
                      Margem {it.margemPDV.toFixed(1)}%
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">PreÃ§o oferta</div>
                  <div className="text-sm font-semibold text-slate-800">{fmtBRL(it.precoOferta)}</div>
                  {it.margemOferta != null && (
                    <div className={`text-[10px] font-bold ${it.margemOferta >= 20 ? "text-emerald-600" : it.margemOferta >= 10 ? "text-amber-600" : "text-red-600"}`}>
                      Margem {it.margemOferta.toFixed(1)}%
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Sellout</div>
                  <div className="text-sm font-semibold text-slate-800">{fmtBRL(it.sellout || null)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* BotÃ£o fixo Adicionar Produto â€” sÃ³ para quem pode editar */}
      {encarte.podeEditar && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 safe-area-pb lg:left-64">
          <button
            onClick={() => setModalAberto(true)}
            className="w-full py-3.5 rounded-2xl bg-brand text-white font-bold text-sm hover:opacity-90 active:scale-95 transition shadow-lg shadow-brand/20">
            + Adicionar Produto
          </button>
        </div>
      )}

      {modalAberto && (
        <AdicionarProdutoModal
          encarteId={id}
          codigoRede={encarte.codigoRede}
          onClose={() => setModalAberto(false)}
          onAdicionado={(enc) => setEncarte(enc)}
        />
      )}
    </div>
  );
}
