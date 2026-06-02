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
  const [expandidos, setExpandidos] = useState(new Set());

  useEffect(() => {
    api.get("/dashboard/supervisor")
      .then(({ data }) => setMetricas(data.metricas || []))
      .catch(() => setMetricas([]))
      .finally(() => setLoading(false));
  }, []);

  // Filtragem
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
        const pct = Math.round((m.diasComEncarte / 30) * 100);
        if (filtroCobertura === "criticas") return pct < 40;
        if (filtroCobertura === "atencao") return pct >= 40 && pct < 70;
        if (filtroCobertura === "boas") return pct >= 70;
        return true;
      });
    }

    return filtradas;
  }, [metricas, busca, filtroCobertura]);

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
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Busca */}
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

          {/* Filtro cobertura */}
          <div className="sm:w-48">
            <select
              value={filtroCobertura}
              onChange={(e) => setFiltroCobertura(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition bg-white"
            >
              <option value="todas">Todas as redes</option>
              <option value="criticas">🔴 Críticas (&lt;40%)</option>
              <option value="atencao">🟡 Atenção (40-69%)</option>
              <option value="boas">🟢 Boas (≥70%)</option>
            </select>
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
  const { codigoRede, redeSubrede, diasComEncarte, diasSemEncarte, topProdutos, totalEncartes } = metrica;

  const percentualCoberto = Math.round((diasComEncarte / 30) * 100);
  
  // Cores baseadas em cobertura
  const getStatusVisual = (pct) => {
    if (pct < 40) return {
      bg: 'bg-red-50',
      border: 'border-l-red-500',
      text: 'text-red-700',
      badge: '🔴',
      label: 'Crítica'
    };
    if (pct < 70) return {
      bg: 'bg-amber-50',
      border: 'border-l-amber-500',
      text: 'text-amber-700',
      badge: '🟡',
      label: 'Atenção'
    };
    return {
      bg: 'bg-emerald-50',
      border: 'border-l-emerald-500',
      text: 'text-emerald-700',
      badge: '🟢',
      label: 'Boa'
    };
  };

  const status = getStatusVisual(percentualCoberto);

  return (
    <div className={`bg-white rounded-lg border-l-4 ${status.border} border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden`}>
      {/* Header clicável */}
      <div 
        onClick={() => onNavigate(codigoRede)}
        className="cursor-pointer hover:bg-slate-50/50 transition"
      >
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          {/* Nome da rede */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm truncate">{redeSubrede}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{totalEncartes} encarte{totalEncartes !== 1 ? 's' : ''} criado{totalEncartes !== 1 ? 's' : ''}</p>
          </div>

          {/* Métricas inline */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Cobertura */}
            <div className={`${status.bg} px-3 py-1.5 rounded-lg text-center min-w-[70px]`}>
              <div className={`text-lg font-bold ${status.text} leading-none`}>{percentualCoberto}%</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{diasComEncarte}/{30}d</div>
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
          </div>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
          {/* Estatísticas de cobertura */}
          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            <div className="bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-slate-500 mb-0.5">Com encarte</div>
              <div className="font-bold text-emerald-700">{diasComEncarte} dias</div>
            </div>
            <div className="bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-slate-500 mb-0.5">Sem encarte</div>
              <div className="font-bold text-red-600">{diasSemEncarte} dias</div>
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
