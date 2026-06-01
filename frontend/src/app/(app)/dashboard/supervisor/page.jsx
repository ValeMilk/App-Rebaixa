"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { IcoCalendar, IcoPackage } from "@/components/Icons";

export default function DashboardSupervisor() {
  const [metricas, setMetricas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/supervisor")
      .then(({ data }) => setMetricas(data.metricas || []))
      .catch(() => setMetricas([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Carregando métricas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Supervisor</h1>
        <p className="text-sm text-slate-500 mt-1">Métricas dos últimos 30 dias por rede</p>
      </div>

      {/* Grid de cards */}
      <div className="p-6">
        {metricas.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-500">Nenhuma rede encontrada ou sem dados nos últimos 30 dias.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {metricas.map((m) => (
              <CardRede key={m.codigoRede} metrica={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardRede({ metrica }) {
  const { redeSubrede, diasComEncarte, diasSemEncarte, topProdutos, totalEncartes } = metrica;

  const percentualCoberto = Math.round((diasComEncarte / 30) * 100);
  const corCobertura = percentualCoberto >= 70 ? "text-emerald-600" : percentualCoberto >= 40 ? "text-amber-600" : "text-red-600";
  const bgCobertura = percentualCoberto >= 70 ? "bg-emerald-50" : percentualCoberto >= 40 ? "bg-amber-50" : "bg-red-50";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand to-blue-600 px-4 py-3">
        <h3 className="font-bold text-white text-lg truncate">{redeSubrede}</h3>
        <p className="text-xs text-white/80 mt-0.5">{totalEncartes} encarte{totalEncartes !== 1 ? "s" : ""} criado{totalEncartes !== 1 ? "s" : ""}</p>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Cobertura */}
        <div className={`${bgCobertura} rounded-xl px-4 py-3 border border-slate-100`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <IcoCalendar className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cobertura</span>
            </div>
            <span className={`text-2xl font-bold ${corCobertura}`}>{percentualCoberto}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Com encarte</div>
              <div className="font-bold text-emerald-700">{diasComEncarte} dias</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Sem encarte</div>
              <div className="font-bold text-red-600">{diasSemEncarte} dias</div>
            </div>
          </div>
        </div>

        {/* Top produtos */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IcoPackage className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Top Produtos</span>
          </div>
          {topProdutos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhum produto encartado</p>
          ) : (
            <div className="space-y-1.5">
              {topProdutos.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-xs text-slate-700 font-medium truncate">{p.produto}</span>
                  </div>
                  <span className="ml-2 text-xs font-bold text-slate-600">{p.count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
