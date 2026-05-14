"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";

export default function SyncPage() {
  const [status, setStatus] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    const { data } = await api.get("/sync/status");
    setStatus(data);
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, []);

  async function rodar(qual) {
    setRodando(true);
    setMsg("Sincronizando...");
    try {
      const { data } = await api.post(`/sync/${qual}`);
      setMsg(`Concluido: ${JSON.stringify(data)}`);
      carregar();
    } catch (err) {
      setMsg(err.response?.data?.error || "Erro");
    } finally {
      setRodando(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Sincronizacao</h1>
      <p className="text-slate-500 mb-6">Atualize manualmente os dados da ATIVMOB e do ERP</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Estoque (ATIVMOB)</h2>
          <p className="text-sm text-slate-500 mb-4">
            Busca e classifica eventos de estoque e vencimento (janela: hoje -90d → +31d).
          </p>
          <button onClick={() => rodar("estoque")} className="btn-primary" disabled={rodando}>
            {rodando ? "Aguarde..." : "Sincronizar agora"}
          </button>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-2">ERP Completo</h2>
          <p className="text-sm text-slate-500 mb-4">
            Atualiza carteira de clientes + catalogo de produtos de uma vez.
            {status && !status.erpConfigurado && (
              <span className="block mt-1 text-amber-600 font-medium">
                ⚠ ERP não configurado — preencha ERP_* no .env da VPS.
              </span>
            )}
          </p>
          <button onClick={() => rodar("erp")} className="btn-secondary" disabled={rodando}>
            Sincronizar agora
          </button>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-2">Carteira (ERP)</h2>
          <p className="text-sm text-slate-500 mb-4">
            Atualiza vínculo Cliente → Vendedor → Supervisor.
          </p>
          <button onClick={() => rodar("carteira")} className="btn-secondary" disabled={rodando}>
            Sincronizar agora
          </button>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-2">Produtos / Preços (ERP)</h2>
          <p className="text-sm text-slate-500 mb-4">
            Importa catálogo com Tabela 70, Preço Mínimo, Promo e Custo.
          </p>
          <button onClick={() => rodar("produtos")} className="btn-secondary" disabled={rodando}>
            Sincronizar agora
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-2">Status</h2>
        <div className="text-sm">
          <p>Em execucao: <strong>{status?.executando ? "Sim" : "Nao"}</strong></p>
          {status?.ultimaExecucao && (
            <>
              <p className="mt-2">Ultima execucao:</p>
              <p>Tipo: {status.ultimaExecucao.tipo}</p>
              <p>Em: {fmtDataHora(status.ultimaExecucao.em)}</p>
              <pre className="mt-2 bg-slate-50 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(status.ultimaExecucao.resultado, null, 2)}
              </pre>
            </>
          )}
        </div>
        {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
      </div>
    </div>
  );
}
