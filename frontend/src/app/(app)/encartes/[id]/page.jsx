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

// IcoTrash pode nao existir — fallback inline
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
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MargemBadge({ pct, onClick, editando, inputValue, onInputChange, onBlur, onKeyDown }) {
  if (pct == null && !editando) return <span className="text-slate-300 text-base font-bold">—</span>;
  
  if (editando) {
    return (
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        autoFocus
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="w-20 text-center font-bold text-lg px-2 py-1 rounded-lg border-2 border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
        placeholder="0.0"
      />
    );
  }
  
  const cor = pct >= 20
    ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:border-emerald-400"
    : pct >= 10
      ? "text-amber-700 bg-amber-50 border-amber-200 hover:border-amber-400"
      : "text-red-700 bg-red-50 border-red-200 hover:border-red-400";
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-block font-bold text-xl px-3 py-0.5 rounded-xl border transition-all cursor-pointer hover:scale-105 active:scale-95 ${cor}`}
      title="Clique para definir a margem e calcular o preço automaticamente"
    >
      {pct.toFixed(1)}%
    </button>
  );
}

/** Modal para adicionar produtos ao encarte (por categoria → subcategoria) */
function AdicionarProdutoModal({ encarteId, codigoRede, onClose, onAdicionado }) {
  // Categoria + Subcategoria + lista
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(true);
  const [categoriaSel, setCategoriaSel] = useState("");
  
  const [subcategorias, setSubcategorias] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [subcategoriaSel, setSubcategoriaSel] = useState("");
  const [q, setQ] = useState("");
  const [produtos, setProdutos] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);

  // Negociação para a subcategoria inteira
  const [precoPDV, setPrecoPDV] = useState("");
  const [precoOferta, setPrecoOferta] = useState("");
  const [sellout, setSellout] = useState("");

  // Edição de margens (cálculo reverso)
  const [editandoMargemPDV, setEditandoMargemPDV] = useState(false);
  const [editandoMargemOferta, setEditandoMargemOferta] = useState(false);
  const [margemPDVInput, setMargemPDVInput] = useState("");
  const [margemOfertaInput, setMargemOfertaInput] = useState("");

  // Produtos desmarcados (por _id)
  const [desmarcados, setDesmarcados] = useState(new Set());

  // Última compra por produtoCodigo (busca em background)
  const [ultimasCompras, setUltimasCompras] = useState({});
  const [ucBuscado, setUcBuscado] = useState(false); // Flag para saber se a busca batch já completou

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  // Carrega categorias ao abrir o modal
  useEffect(() => {
    api.get("/encartes/categorias")
      .then(({ data }) => setCategorias(data.categorias || []))
      .catch(() => setCategorias([]))
      .finally(() => setLoadingCategorias(false));
  }, []);

  // Carrega subcategorias quando categoria mudar (ou todas se nenhuma categoria selecionada)
  useEffect(() => {
    setLoadingSubs(true);
    const params = categoriaSel ? { categoria: categoriaSel } : {};
    api.get("/encartes/subcategorias", { params })
      .then(({ data }) => setSubcategorias(data.subcategorias || []))
      .catch(() => setSubcategorias([]))
      .finally(() => setLoadingSubs(false));
    
    // Limpa subcategoria e produtos quando categoria muda
    setSubcategoriaSel("");
    setProdutos([]);
    setQ("");
    setDesmarcados(new Set());
  }, [categoriaSel]);

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

  // Busca última compra de todos os produtos em UMA ÚNICA requisição batch otimizada
  useEffect(() => {
    if (produtos.length === 0) return;
    setUltimasCompras({});
    setUcBuscado(false); // Reset quando produtos mudarem
    
    let cancelled = false;
    (async () => {
      try {
        const codigos = produtos.map(p => p.codigoLivre || p.codigo);
        const { data } = await api.post("/erp/ultima-compra-rede-batch", {
          codigoRede,
          produtosCodigos: codigos
        });
        
        if (!cancelled && data?.resultados) {
          setUltimasCompras(data.resultados);
          setUcBuscado(true); // Marca que a busca completou
        }
      } catch (err) {
        console.error("Erro ao buscar últimas compras em batch:", err);
        setUcBuscado(true); // Mesmo com erro, marca como "buscado" para não ficar "buscando..." eternamente
      }
    })();
    
    return () => { cancelled = true; };
  }, [produtos, codigoRede]);

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

  // Estatisticas dos selecionados (medias) e margens preview
  const pdvNum     = Number(precoPDV)    || 0;
  const ofertaNum  = Number(precoOferta) || 0;
  const selloutNum = Number(sellout)     || 0;

  const stats = useMemo(() => {
    if (produtosSelecionados.length === 0) return null;
    let tabSum = 0, tabN = 0;
    let minSum = 0, minN = 0;
    let promoSum = 0, promoN = 0;
    let ucSum  = 0, ucN  = 0;
    let ucMaisRecente = null;
    for (const p of produtosSelecionados) {
      const cod = p.codigoLivre || p.codigo;
      if (p.precoTabela) { tabSum += Number(p.precoTabela); tabN++; }
      if (p.precoMinimo) { minSum += Number(p.precoMinimo); minN++; }
      if (p.precoPromo > 0) { promoSum += Number(p.precoPromo); promoN++; }
      const uc = ultimasCompras[cod];
      if (uc?.preco != null) {
        ucSum += Number(uc.preco); ucN++;
        if (uc.data && (!ucMaisRecente || new Date(uc.data) > new Date(ucMaisRecente))) {
          ucMaisRecente = uc.data;
        }
      }
    }
    return {
      mediaTabela:    tabN   ? tabSum   / tabN   : null,
      mediaMinimo:    minN   ? minSum   / minN   : null,
      mediaPrecoPromo: promoN ? promoSum / promoN : null,
      mediaUC:        ucN    ? ucSum    / ucN    : null,
      ucCarregados: ucN,
      ucMaisRecente,
    };
  }, [produtosSelecionados, ultimasCompras]);

  const margemPDVPreview = (stats?.mediaUC != null && pdvNum > 0)
    ? ((pdvNum - stats.mediaUC) / pdvNum) * 100
    : null;
  const custoPromoPreview = stats?.mediaUC != null
    ? Math.max(0, Math.round((stats.mediaUC - selloutNum) * 1000) / 1000) // Evita valores negativos por arredondamento
    : null;
  const margemOfertaPreview = (custoPromoPreview != null && ofertaNum > 0)
    ? ((ofertaNum - custoPromoPreview) / ofertaNum) * 100
    : null;

  // Funções para cálculo reverso (margem → preço)
  function calcularPrecoPorMargemPDV(margemDesejada) {
    if (!stats?.mediaUC || margemDesejada >= 100 || margemDesejada < 0) return;
    const precoCalculado = stats.mediaUC / (1 - margemDesejada / 100);
    setPrecoPDV(precoCalculado.toFixed(2));
  }

  function calcularPrecoPorMargemOferta(margemDesejada) {
    if (!custoPromoPreview || margemDesejada >= 100 || margemDesejada < 0) return;
    const precoCalculado = custoPromoPreview / (1 - margemDesejada / 100);
    setPrecoOferta(precoCalculado.toFixed(2));
  }

  function handleMargemPDVClick() {
    if (margemPDVPreview != null) {
      setMargemPDVInput(margemPDVPreview.toFixed(1));
      setEditandoMargemPDV(true);
    }
  }

  function handleMargemOfertaClick() {
    if (margemOfertaPreview != null) {
      setMargemOfertaInput(margemOfertaPreview.toFixed(1));
      setEditandoMargemOferta(true);
    }
  }

  function aplicarMargemPDV() {
    const margem = Number(margemPDVInput);
    if (!isNaN(margem)) calcularPrecoPorMargemPDV(margem);
    setEditandoMargemPDV(false);
  }

  function aplicarMargemOferta() {
    const margem = Number(margemOfertaInput);
    if (!isNaN(margem)) calcularPrecoPorMargemOferta(margem);
    setEditandoMargemOferta(false);
  }

  const todosMarcados = produtos.length > 0 && produtosSelecionados.length === produtos.length;
  function toggleTodos() {
    if (todosMarcados) setDesmarcados(new Set(produtos.map((p) => p._id)));
    else setDesmarcados(new Set());
  }

  // Custo Promo preview (sem UC ainda, mostrado por produto após salvar)

  async function handleSalvar() {
    setErro("");
    if (!subcategoriaSel) { setErro("Selecione uma subcategoria"); return; }
    if (!precoPDV)        { setErro("Informe o Preço PDV"); return; }
    if (!precoOferta)     { setErro("Informe o Preço Oferta"); return; }
    if (produtosSelecionados.length === 0) { setErro("Selecione pelo menos um produto"); return; }
    // Tarefa 3: bloquear se margem oferta > margem PDV
    if (margemOfertaPreview !== null && margemPDVPreview !== null && margemOfertaPreview > margemPDVPreview) {
      setErro(`Margem Oferta (${margemOfertaPreview.toFixed(1)}%) não pode ser maior que Margem PDV (${margemPDVPreview.toFixed(1)}%). Ajuste o preço de oferta ou sellout.`);
      return;
    }
    setSalvando(true);
    setProgresso({ feitos: 0, total: produtosSelecionados.length });

    let ultimoEncarte = null;
    let erros = 0;

    // Processa em batches de 4 para não saturar o ERP
    const lote = 4;
    for (let i = 0; i < produtosSelecionados.length; i += lote) {
      const batch = produtosSelecionados.slice(i, i + lote);
      const results = await Promise.allSettled(batch.map(async (p) => {
        const cod = p.codigoLivre || p.codigo;
        // Reutiliza UC já buscada em background
        let precoUC = ultimasCompras[cod]?.preco ?? null;
        let dataUC  = ultimasCompras[cod]?.data  ?? null;
        if (precoUC == null) {
          try {
            const { data: uc } = await api.post("/erp/ultima-compra-rede", { produtoCodigo: cod, codigoRede });
            if (uc?.encontrado) { precoUC = Number(uc.precoUltimaCompra); dataUC = uc.dataUltimaCompra; }
          } catch { /* segue sem UC */ }
        }

        const margemPDV    = precoUC != null ? Math.round((((pdvNum - precoUC) / pdvNum) * 100) * 10) / 10 : null;
        const custoPromo   = precoUC != null ? Math.max(0, Math.round((precoUC - selloutNum) * 1000) / 1000) : null;
        const margemOferta = custoPromo != null ? Math.round((((ofertaNum - custoPromo) / ofertaNum) * 100) * 10) / 10 : null;

        const { data } = await api.post(`/encartes/${encarteId}/itens`, {
          produtoCodigo:     cod,
          produto:           p.descricao,
          subcategoria:      p.subcategoria || null,
          precoTabela:       p.precoTabela,
          precoMinimo:       p.precoMinimo,
          precoPromo:        p.precoPromo,
          custo:             p.custo,
          precoUltimaCompra: precoUC,
          dataUltimaCompra:  dataUC,
          precoOferta:       ofertaNum,
          precoPDV:          pdvNum,
          sellout:           selloutNum,
          custoPromo,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-8 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={salvando ? undefined : onClose} />
      
      {/* Modal container — desktop wide, mobile full */}
      <div className="relative bg-white shadow-2xl flex flex-col w-full max-w-6xl rounded-2xl max-h-[92vh] lg:max-h-[85vh] animate-slide-up">
        
        {/* Header compacto */}
        <div className="shrink-0 px-4 lg:px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-white font-bold text-sm">
                +
              </div>
              <div>
                <div className="text-[10px] font-semibold text-brand uppercase tracking-wider">
                  Precificar para Encarte
                </div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight">
                  {subcategoriaSel || "Selecione uma subcategoria"}
                </h2>
              </div>
            </div>
            
            {/* Estatísticas inline no header — apenas desktop */}
            {stats && (
              <div className="hidden lg:flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-4 py-2 shadow-sm">
                <div className="text-center border-r border-slate-200 pr-4">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Tabela(70)</div>
                  <div className="font-bold text-slate-900">{fmtBRL(stats.mediaTabela)}</div>
                </div>
                <div className="text-center border-r border-slate-200 pr-4">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Mínimo</div>
                  <div className="font-bold text-slate-900">{fmtBRL(stats.mediaMinimo)}</div>
                </div>
                {stats.mediaPrecoPromo != null && (
                  <div className="text-center border-r border-slate-200 pr-4">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Promo</div>
                    <div className="font-bold text-violet-600">{fmtBRL(stats.mediaPrecoPromo)}</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Últ. Compra</div>
                  {stats.mediaUC != null
                    ? <div className="font-bold text-brand">{fmtBRL(stats.mediaUC)}</div>
                    : ucBuscado ? <div className="text-slate-300 text-xs">sem compra</div> : <div className="text-slate-300 text-xs">buscando...</div>
                  }
                </div>
              </div>
            )}
            
            <button onClick={onClose} disabled={salvando} aria-label="Fechar"
              className="shrink-0 h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600 disabled:opacity-50">
              <IcoX className="w-5 h-5" />
            </button>
          </div>
          
          {/* Estatísticas mobile — abaixo do header */}
          {stats && (
            <div className="lg:hidden mt-3 bg-white rounded-lg border border-slate-200 px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Preço tabela(70)</span>
                <span className="font-semibold text-slate-700">{fmtBRL(stats.mediaTabela)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Preço mínimo</span>
                <span className="font-semibold text-slate-700">{fmtBRL(stats.mediaMinimo)}</span>
              </div>
              {stats.mediaPrecoPromo != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Preço promo</span>
                  <span className="font-semibold text-violet-600">{fmtBRL(stats.mediaPrecoPromo)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs border-t border-slate-200 pt-1 mt-1">
                <span className="text-slate-500">Última compra</span>
                {stats.mediaUC != null
                  ? <span className="font-bold text-brand">{fmtBRL(stats.mediaUC)}</span>
                  : ucBuscado ? <span className="text-slate-300 text-xs">sem compra</span> : <span className="text-slate-300 text-xs">buscando...</span>
                }
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo principal — grid 2 colunas no desktop */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          
          {/* Painel ESQUERDO (desktop): Lista de produtos + Subcategoria */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden order-2 lg:order-1">
            
            {/* Categoria — apenas mobile (no desktop vai pro painel direito) */}
            <div className="lg:hidden shrink-0 p-4 pb-3 border-b border-slate-200">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Categoria
              </label>
              {loadingCategorias ? (
                <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand animate-spin" />
                  Carregando...
                </div>
              ) : (
                <select
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  value={categoriaSel}
                  onChange={(e) => setCategoriaSel(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Subcategoria — apenas mobile (no desktop vai pro painel direito) */}
            <div className="lg:hidden shrink-0 p-4 pb-3 border-b border-slate-200">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Subcategoria
              </label>
              {loadingSubs ? (
                <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand animate-spin" />
                  Carregando...
                </div>
              ) : (
                <select
                  autoFocus
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  value={subcategoriaSel}
                  onChange={(e) => { setSubcategoriaSel(e.target.value); setQ(""); setDesmarcados(new Set()); }}>
                  <option value="">Selecione uma subcategoria...</option>
                  {subcategorias.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Filtro + Contador */}
            {subcategoriaSel && (
              <div className="shrink-0 px-4 lg:px-6 pt-4 pb-3 border-b border-slate-200 space-y-3">
                <div className="relative">
                  <IcoSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 text-sm font-medium focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder="Filtrar por nome ou código..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                
                {produtos.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      <span className="font-bold text-brand text-lg">{produtosSelecionados.length}</span>
                      <span className="text-slate-400"> / {produtos.length} selecionados</span>
                    </span>
                    <button type="button" onClick={toggleTodos} className="text-brand font-semibold hover:underline">
                      {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lista de produtos com scroll */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4"
              style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
              <div className="space-y-2">

                {loadingProdutos && (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
                  </div>
                )}

                {!loadingProdutos && subcategoriaSel && produtos.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-12">Nenhum produto encontrado</p>
                )}

                {!subcategoriaSel && (
                  <p className="text-center text-slate-400 text-sm py-12">Selecione uma subcategoria para ver os produtos</p>
                )}

                {/* Cards de produtos */}
                {produtos.map((p) => {
                  const marcado = !desmarcados.has(p._id);
                  const cod = p.codigoLivre || p.codigo;
                  const uc = ultimasCompras[cod];
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => toggleProduto(p._id)}
                      className={`relative w-full text-left transition rounded-xl border-2 p-3 hover:shadow-md ${
                        marcado 
                          ? "border-brand/40 bg-brand/5 ring-2 ring-brand/20" 
                          : "border-slate-200 bg-white opacity-60 hover:opacity-100"
                      }`}
                    >
                      {/* Checkbox */}
                      <div className={`absolute top-3 right-3 h-6 w-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${
                        marcado ? "bg-brand border-brand" : "bg-white border-slate-300"
                      }`}>
                        {marcado && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      
                      <div className="pr-8">
                        <div className="font-bold text-slate-800 text-sm mb-0.5 line-clamp-2 leading-tight">{p.descricao}</div>
                        <div className="text-xs text-slate-400 mb-2.5">Cód {cod}</div>
                        
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Tabela</span>
                            <span className="font-semibold text-slate-700">{fmtBRL(p.precoTabela)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Mínimo</span>
                            <span className="font-semibold text-slate-700">{fmtBRL(p.precoMinimo)}</span>
                          </div>
                          {p.precoPromo > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Promo</span>
                              <span className="font-semibold text-violet-600">{fmtBRL(p.precoPromo)}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-1 border-t border-slate-200">
                            <span className="text-slate-500 font-medium">Últ. Compra</span>
                            {uc
                              ? <span className="font-bold text-brand">{fmtBRL(uc.preco)}</span>
                              : ucBuscado ? <span className="text-slate-300 text-[10px]">sem compra</span> : <span className="text-slate-300 text-[10px]">buscando...</span>
                            }
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Painel DIREITO (desktop): Subcategoria + Precificação (MARGENS EM DESTAQUE) */}
          <div className="lg:w-[520px] xl:w-[600px] shrink-0 border-b lg:border-b-0 lg:border-l border-slate-200 overflow-y-auto p-4 lg:p-5 space-y-4 order-1 lg:order-2 bg-gradient-to-b from-slate-50/50 to-white">
            
            {/* Categoria — apenas desktop */}
            <div className="hidden lg:block">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Categoria
              </label>
              {loadingCategorias ? (
                <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand animate-spin" />
                  Carregando...
                </div>
              ) : (
                <select
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  value={categoriaSel}
                  onChange={(e) => setCategoriaSel(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Subcategoria — apenas desktop */}
            <div className="hidden lg:block">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Subcategoria
              </label>
              {loadingSubs ? (
                <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand animate-spin" />
                  Carregando...
                </div>
              ) : (
                <select
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  value={subcategoriaSel}
                  onChange={(e) => { setSubcategoriaSel(e.target.value); setQ(""); setDesmarcados(new Set()); }}>
                  <option value="">Selecione uma subcategoria...</option>
                  {subcategorias.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Margens lado a lado — Grid 2 colunas no desktop */}
            {subcategoriaSel && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                
                {/* Margem PDV */}
                <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border-2 border-blue-100 p-3 lg:p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Margem PDV</span>
                    <MargemBadge 
                      pct={margemPDVPreview}
                      onClick={handleMargemPDVClick}
                      editando={editandoMargemPDV}
                      inputValue={margemPDVInput}
                      onInputChange={setMargemPDVInput}
                      onBlur={aplicarMargemPDV}
                      onKeyDown={(e) => { if (e.key === 'Enter') aplicarMargemPDV(); if (e.key === 'Escape') setEditandoMargemPDV(false); }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 mb-3">
                    {editandoMargemPDV 
                      ? "✏️ Defina a margem desejada e o preço será calculado automaticamente" 
                      : "(PDV - Última Compra) / PDV · Clique na % para editar"
                    }
                  </div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Preço PDV (R$)</label>
                  <input type="number" inputMode="decimal" step="0.01"
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder="0,00" value={precoPDV} onChange={(e) => setPrecoPDV(e.target.value)} />
                </div>

                {/* Margem Oferta */}
                <div className="bg-gradient-to-br from-emerald-50 to-slate-50 rounded-xl border-2 border-emerald-100 p-3 lg:p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Margem Oferta</span>
                    <MargemBadge 
                      pct={margemOfertaPreview}
                      onClick={handleMargemOfertaClick}
                      editando={editandoMargemOferta}
                      inputValue={margemOfertaInput}
                      onInputChange={setMargemOfertaInput}
                      onBlur={aplicarMargemOferta}
                      onKeyDown={(e) => { if (e.key === 'Enter') aplicarMargemOferta(); if (e.key === 'Escape') setEditandoMargemOferta(false); }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 mb-3">
                    {editandoMargemOferta
                      ? "✏️ Defina a margem desejada e o preço será calculado automaticamente"
                      : "(Oferta - Custo Promo) / Oferta · Clique na % para editar"
                    }
                  </div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Preço oferta (encarte)</label>
                  <input type="number" inputMode="decimal" step="0.01"
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder="0,00" value={precoOferta} onChange={(e) => setPrecoOferta(e.target.value)} />
                </div>
              </div>
            )}

            {/* Sellout + Custo Promo — Span 2 colunas */}
            {subcategoriaSel && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sellout</label>
                    {(() => {
                      const uc = stats?.mediaUC;
                      const pdv = pdvNum;
                      const oferta = ofertaNum;
                      if (!uc || !pdv || !oferta || pdv <= oferta) return null;
                      const sugerido = uc * (pdv - oferta) / pdv;
                      return (
                        <button
                          type="button"
                          onClick={() => setSellout(sugerido.toFixed(2))}
                          className="text-[10px] font-bold text-brand bg-white hover:bg-brand/10 px-2 py-1 rounded-lg transition border border-brand/20 shadow-sm"
                        >
                          💡 Sugerir: R$ {sugerido.toFixed(2)}
                        </button>
                      );
                    })()}
                  </div>
                  <input type="number" inputMode="decimal" step="0.01"
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder="0,00" value={sellout} onChange={(e) => setSellout(e.target.value)} />
                </div>
                
                <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl px-4 py-3 border-2 border-emerald-200 shadow-sm">
                  <div>
                    <div className="text-sm font-bold text-slate-700">💰 Custo Promo</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Últ. Compra - Sellout</div>
                  </div>
                  {custoPromoPreview != null
                    ? <span className="text-2xl font-bold text-emerald-600">{fmtBRL(custoPromoPreview)}</span>
                    : <span className="text-2xl font-bold text-slate-300">—</span>
                  }
                </div>
              </div>
            )}

            {erro && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2 text-xs font-medium text-red-700">
                {erro}
              </div>
            )}
          </div>
        </div>

        {/* Footer com botão de salvar */}
        {subcategoriaSel && produtos.length > 0 && (
          <div className="shrink-0 px-4 lg:px-6 pb-4 lg:pb-5 pt-3 border-t border-slate-200 bg-gradient-to-t from-slate-50 to-white rounded-b-2xl">
            {salvando && progresso.total > 0 && (
              <div className="mb-3">
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand to-brand-600 transition-all duration-300" style={{ width: `${(progresso.feitos / progresso.total) * 100}%` }} />
                </div>
                <div className="text-xs text-slate-600 text-center mt-1.5 font-medium">
                  Adicionando {progresso.feitos} de {progresso.total} produtos...
                </div>
              </div>
            )}
            <button
              onClick={handleSalvar}
              disabled={salvando || produtosSelecionados.length === 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 text-white font-bold text-base hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
              {salvando ? "Adicionando produtos..." : `✓ Adicionar ${produtosSelecionados.length} produto${produtosSelecionados.length === 1 ? "" : "s"} ao encarte`}
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
  const [gruposAbertos, setGruposAbertos] = useState({});

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
    if (!confirm(`Excluir o encarte "${encarte.nome}"? Esta ação não pode ser desfeita.`)) return;
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
      // Preserva podeEditar do encarte atual caso o backend não retorne
      setEncarte({ ...data, podeEditar: data.podeEditar ?? encarte.podeEditar });
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
          <p className="text-slate-600 font-semibold">{erro || "Encarte não encontrado"}</p>
          <button onClick={() => router.back()} className="mt-3 text-brand text-sm underline">Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 safe-area-pt">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition shrink-0">
            <IcoChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-slate-500 mb-0.5 truncate">{encarte.redeSubrede || encarte.codigoRede}</div>
            <h1 className="font-semibold text-slate-900 text-base leading-tight truncate">{encarte.nome}</h1>
          </div>
          {encarte.podeEditar ? (
            <button
              onClick={excluirEncarte}
              disabled={excluindo}
              className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 hover:bg-red-50 flex items-center justify-center text-slate-500 hover:text-red-500 transition disabled:opacity-40">
              <TrashIcon className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[9px] bg-slate-100 text-slate-500 font-semibold px-2 py-1 rounded-md shrink-0">
              VISUALIZAÇÃO
            </span>
          )}
        </div>

        {/* Período + Contagem */}
        <div className="flex items-center gap-4 mt-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <IcoCalendar className="w-3.5 h-3.5 shrink-0" />
            <span>{fmtData(encarte.periodoInicio)} → {fmtData(encarte.periodoFim)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IcoTag className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold text-slate-700">{encarte.itens.length}</span>
            <span>produto{encarte.itens.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Lista de itens - accordion por subcategoria */}
      <div className="flex-1 p-4 pb-24 space-y-2">
        {encarte.itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
              <IcoPackage className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-600 font-medium">Nenhum produto adicionado</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
              {encarte.podeEditar ? 'Adicione produtos para montar o encarte' : 'Aguardando produtos'}
            </p>
          </div>
        ) : (() => {
          const grupos = {};
          for (const it of encarte.itens) {
            const key = it.subcategoria || 'Sem subcategoria';
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(it);
          }
          return Object.entries(grupos).map(([sub, itens]) => {
            const aberto = gruposAbertos[sub] !== false; // aberto por padrão
            return (
              <div key={sub} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Cabeçalho clicável */}
                <button
                  type="button"
                  onClick={() => setGruposAbertos(prev => ({ ...prev, [sub]: !aberto }))}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50/70 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-700 tracking-wide">{sub}</span>
                    <span className="text-[10px] text-slate-500 font-medium bg-slate-100 rounded-md px-1.5 py-0.5">
                      {itens.length}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Produtos */}
                {aberto && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                    {itens.map((it) => (
                      <div key={it._id} className="border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50/50 hover:border-slate-300 transition">
                        {/* Nome + Botão remover */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 text-sm leading-snug">{it.produto}</div>
                            <div className="text-xs text-slate-400 mt-0.5">#{it.produtoCodigo || '—'}</div>
                          </div>
                          {encarte.podeEditar && (
                            <button
                              onClick={() => removerItem(String(it._id))}
                              disabled={removendoId === String(it._id)}
                              className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition disabled:opacity-40 shrink-0">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Dados em linha compacta */}
                        <div className="space-y-2">
                          {/* Última compra */}
                          <div className="flex items-center justify-between text-xs gap-3">
                            <span className="text-slate-500 flex-shrink-0">Última compra</span>
                            <div className="text-right flex-shrink-0">
                              <div className="font-semibold text-slate-700 tabular-nums">{fmtBRL(it.precoUltimaCompra)}</div>
                              {it.dataUltimaCompra && (
                                <div className="text-[10px] text-slate-400 tabular-nums">{fmtData(it.dataUltimaCompra)}</div>
                              )}
                            </div>
                          </div>

                          {/* PDV */}
                          <div className="flex items-center justify-between text-xs bg-blue-50/50 rounded-lg px-2.5 py-1.5 gap-3">
                            <span className="text-slate-600 font-medium flex-shrink-0">PDV</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-slate-900 tabular-nums min-w-[4.5rem] text-right">{fmtBRL(it.precoPDV)}</span>
                              {it.margemPDV != null && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  it.margemPDV >= 20 ? 'bg-emerald-100 text-emerald-700' : 
                                  it.margemPDV >= 10 ? 'bg-amber-100 text-amber-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {it.margemPDV.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Oferta */}
                          <div className="flex items-center justify-between text-xs bg-emerald-50/50 rounded-lg px-2.5 py-1.5 gap-3">
                            <span className="text-slate-600 font-medium flex-shrink-0">Oferta</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-slate-900 tabular-nums min-w-[4.5rem] text-right">{fmtBRL(it.precoOferta)}</span>
                              {it.margemOferta != null && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  it.margemOferta >= 20 ? 'bg-emerald-100 text-emerald-700' : 
                                  it.margemOferta >= 10 ? 'bg-amber-100 text-amber-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {it.margemOferta.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sellout + Custo Promo em linha */}
                          <div className="flex items-center gap-2 text-xs pt-1">
                            <div className="flex-1 flex items-center justify-between gap-2">
                              <span className="text-slate-500 flex-shrink-0">Sellout</span>
                              <span className="font-semibold text-slate-700 tabular-nums text-right">{fmtBRL(it.sellout || null)}</span>
                            </div>
                            {it.custoPromo != null && (
                              <>
                                <div className="h-3 w-px bg-slate-200 flex-shrink-0" />
                                <div className="flex-1 flex items-center justify-between gap-2">
                                  <span className="text-slate-500 flex-shrink-0">Custo Promo</span>
                                  <span className="font-bold text-emerald-600 tabular-nums text-right">{fmtBRL(it.custoPromo)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Botão fixo Adicionar Produto — só para quem pode editar */}
      {encarte.podeEditar && (
        <div className="fixed bottom-20 lg:bottom-4 left-0 right-0 px-4 safe-area-pb flex justify-center">
          <div className="w-full max-w-md">
            <button
              onClick={() => setModalAberto(true)}
              className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-600 text-white font-semibold text-sm active:scale-[0.98] transition shadow-lg">
              + Adicionar Produto
            </button>
          </div>
        </div>
      )}

      {modalAberto && (
        <AdicionarProdutoModal
          encarteId={id}
          codigoRede={encarte.codigoRede}
          onClose={() => setModalAberto(false)}
          onAdicionado={(enc) => setEncarte({ ...enc, podeEditar: enc.podeEditar ?? encarte.podeEditar })}
        />
      )}
    </div>
  );
}
