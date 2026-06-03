"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { IcoCalendar, IcoPackage, IcoSearch } from "@/components/Icons";

export default function DashboardSupervisor() {
  const router = useRouter();
  const [metricas, setMetricas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCobertura, setFiltroCobertura] = useState("todas"); // todas | criticas | atencao | boas
  const [ordenacao, setOrdenacao] = useState("cobertura-desc"); // cobertura-desc | cobertura-asc | nome-asc | nome-desc
  const [expandidos, setExpandidos] = useState(new Set());

  useEffect(() => {
    api.get("/dashboard/supervisor")
      .then(({ data }) => setMetricas(data.metricas || []))
      .catch(() => setMetricas([]))
      .finally(() => setLoading(false));
  }, []);

  // Filtragem e ordenação
  const metricasFiltradas = useMemo(() => {
    let filtradas = metricas;

    // Filtro por busca
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      filtradas = filtradas.filter(m => 
        m.redeSubrede.toLowerCase().includes(termo)
      );
    }

    // Filtro por cobertura
    if (filtroCobertura !== "todas") {
      filtradas = filtradas.filter(m => {
        const pct = m.percentualNegociacao; // Usar percentual que vem do backend
        if (filtroCobertura === "criticas") return pct === 0;
        if (filtroCobertura === "atencao") return pct > 0 && pct < 70;
        if (filtroCobertura === "boas") return pct >= 70;
        return true;
      });
    }

    // Ordenação
    const ordenadas = [...filtradas];
    if (ordenacao === "cobertura-desc") {
      // Maior cobertura primeiro (padrão)
      ordenadas.sort((a, b) => b.percentualNegociacao - a.percentualNegociacao);
    } else if (ordenacao === "cobertura-asc") {
      // Menor cobertura primeiro (críticas no topo)
      ordenadas.sort((a, b) => a.percentualNegociacao - b.percentualNegociacao);
    } else if (ordenacao === "nome-asc") {
      // A-Z
      ordenadas.sort((a, b) => a.redeSubrede.localeCompare(b.redeSubrede));
    } else if (ordenacao === "nome-desc") {
      // Z-A
      ordenadas.sort((a, b) => b.redeSubrede.localeCompare(a.redeSubrede));
    }

    return ordenadas;
  }, [metricas, busca, filtroCobertura, ordenacao]);

  const toggleExpand = (codigoRede, e) => {
    e.stopPropagation(); // Evita navegar ao clicar no botão expand
    setExpandidos(prev => {
      const novo = new Set(prev);
      if (novo.has(codigoRede)) novo.delete(codigoRede);
      else novo.add(codigoRede);
      return novo;
    });
  };

  const navegarParaEncartes = (codigoRede) => {
    router.push(`/encartes?rede=${encodeURIComponent(codigoRede)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-brand animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <h1 className="text-xl font-bold text-slate-900">Dashboard Supervisor</h1>
        <p className="text-xs text-slate-500 mt-1">Métricas dos últimos 30 dias por rede</p>
      </div>

      {/* Barra de ferramentas */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3">
          {/* Linha 1: Busca */}
          <div className="flex-1 relative">
            <IcoSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar rede..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
            />
          </div>

          {/* Linha 2: Filtro e Ordenação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Filtro cobertura */}
            <div>
              <select
                value={filtroCobertura}
                onChange={(e) => setFiltroCobertura(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition bg-white"
              >
                <option value="todas">Cobertura: Todas as redes</option>
                <option value="criticas">🔴 Críticas (0%)</option>
                <option value="atencao">🟡 Atenção (1-69%)</option>
                <option value="boas">🟢 Boas (≥70%)</option>
              </select>
            </div>

            {/* Ordenação */}
            <div>
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition bg-white"
              >
                <option value="cobertura-desc">Cobertura: Maior → Menor</option>
                <option value="cobertura-asc">Cobertura: Menor → Maior</option>
                <option value="nome-asc">Nome: A → Z</option>
                <option value="nome-desc">Nome: Z → A</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contador */}
        <div className="mt-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{metricasFiltradas.length}</span> {metricasFiltradas.length === 1 ? 'rede encontrada' : 'redes encontradas'}
        </div>
      </div>

      {/* Lista de redes */}
      <div className="p-4">
        {metricasFiltradas.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <IcoSearch className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">Nenhuma rede encontrada</p>
            <p className="text-sm text-slate-400 mt-1">Tente ajustar os filtros de busca</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-5xl mx-auto">
            {metricasFiltradas.map((m) => (
              <CardRedeLista 
                key={m.codigoRede} 
                metrica={m} 
                expandido={expandidos.has(m.codigoRede)}
                onToggleExpand={toggleExpand}
                onNavigate={navegarParaEncartes}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardRedeLista({ metrica, expandido, onToggleExpand, onNavigate }) {
  const { codigoRede, redeSubrede, diasTotais, diasNegociados, percentualNegociacao, topProdutos, totalEncartes } = metrica;

  // Cores e badges baseados em % de negociação
  const getStatusVisual = (pct) => {
    if (pct === 0) return {
      border: 'border-l-red-600',
      bgPct: 'bg-red-100',
      textPct: 'text-red-700',
      badge: 'CRÍTICO!',
      badgeBg: 'bg-red-600',
      badgeText: 'text-white'
    };
    if (pct < 40) return {
      border: 'border-l-red-500',
      bgPct: 'bg-red-50',
      textPct: 'text-red-700',
      badge: 'URGENTE',
      badgeBg: 'bg-red-500',
      badgeText: 'text-white'
    };
    if (pct < 70) return {
      border: 'border-l-amber-500',
      bgPct: 'bg-amber-50',
      textPct: 'text-amber-700',
      badge: 'ATENÇÃO',
      badgeBg: 'bg-amber-500',
      badgeText: 'text-white'
    };
    return {
      border: 'border-l-emerald-500',
      bgPct: 'bg-emerald-50',
      textPct: 'text-emerald-700',
      badge: 'BOA',
      badgeBg: 'bg-emerald-500',
      badgeText: 'text-white'
    };
  };

  const status = getStatusVisual(percentualNegociacao);

  return (
    <div className={`bg-white rounded-lg border-l-[3px] ${status.border} border border-slate-200 shadow-sm hover:shadow-lg hover:scale-[1.01] transition-all overflow-hidden`}>
      {/* Header clicável - Layout inline otimizado */}
      <div 
        onClick={() => onNavigate(codigoRede)}
        className="cursor-pointer hover:bg-slate-50/70 transition group"
      >
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          {/* Coluna esquerda: Nome da rede */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base truncate group-hover:text-brand transition">
              {redeSubrede}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {diasNegociados} negociados • {diasTotais} dias totais
            </p>
          </div>

          {/* Coluna direita: Percentual + Badge + Ações */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Percentual gigante */}
            <div className={`${status.bgPct} px-4 py-1.5 rounded-lg`}>
              <div className={`text-3xl font-black ${status.textPct} leading-none tabular-nums`}>
                {percentualNegociacao}%
              </div>
            </div>

            {/* Badge de status */}
            <div className={`${status.badgeBg} ${status.badgeText} px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap`}>
              {status.badge}
            </div>

            {/* Botão expand */}
            <button
              onClick={(e) => onToggleExpand(codigoRede, e)}
              className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition flex-shrink-0"
              title={expandido ? "Ocultar detalhes" : "Ver top produtos"}
            >
              <svg 
                className={`w-4 h-4 transition-transform ${expandido ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Ícone de navegação */}
            <svg 
              className="w-5 h-5 text-slate-400 group-hover:text-brand group-hover:translate-x-1 transition-all flex-shrink-0" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
          {/* Estatísticas de negociação */}
          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            <div className="bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-slate-500 mb-0.5">Negociados</div>
              <div className="font-bold text-emerald-700">{diasNegociados} dias</div>
            </div>
            <div className="bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-slate-500 mb-0.5">Não negociados</div>
              <div className="font-bold text-red-600">{diasTotais - diasNegociados} dias</div>
            </div>
          </div>

          {/* Top produtos */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <IcoPackage className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Top Produtos</span>
            </div>
            {topProdutos.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">Nenhum produto encartado</p>
            ) : (
              <div className="space-y-1.5">
                {topProdutos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand/10 text-brand text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-xs text-slate-700 font-medium truncate">{p.produto}</span>
                    </div>
                    <span className="ml-2 text-xs font-bold text-slate-600 flex-shrink-0">{p.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
