"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { CLASSES, fmtData } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export default function EstoquePage() {
  const { user } = useAuth();
  const [itens, setItens] = useState([]);
  const [classe, setClasse] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState({});
  const [tipoSolic, setTipoSolic] = useState("rebaixa");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const params = {};
      if (classe) params.classificacao = classe;
      if (q) params.q = q;
      const { data } = await api.get("/estoque", { params });
      setItens(data.itens || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  function toggleSel(item) {
    const key = item._id;
    setSelecionados((prev) => {
      const novo = { ...prev };
      if (novo[key]) delete novo[key];
      else novo[key] = item;
      return novo;
    });
  }

  const selKeys = Object.keys(selecionados);
  const podeCriar = user?.role === "supervisor" || user?.role === "admin";

  // Agrupar por cliente para criar 1 solicitacao por cliente
  const grupos = useMemo(() => {
    const m = new Map();
    for (const k of selKeys) {
      const it = selecionados[k];
      const key = it.clienteCodigo;
      if (!m.has(key)) m.set(key, { cliente: it.cliente, clienteCodigo: it.clienteCodigo, itens: [] });
      m.get(key).itens.push(it);
    }
    return Array.from(m.values());
  }, [selKeys, selecionados]);

  async function enviar() {
    if (!grupos.length) return;
    setEnviando(true);
    try {
      for (const g of grupos) {
        await api.post("/solicitacoes", {
          tipo: tipoSolic,
          cliente: g.cliente,
          clienteCodigo: g.clienteCodigo,
          motivo,
          itens: g.itens.map((it) => ({
            produto: it.produto,
            produtoCodigo: it.produtoCodigo,
            quantidade: it.quantidade,
            dataValidade: it.dataValidade,
            diasParaVencer: it.diasParaVencer,
            estoqueRefId: it._id,
          })),
        });
      }
      alert(`Criadas ${grupos.length} solicitacao(oes)!`);
      setSelecionados({});
      setMotivo("");
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao criar solicitacao");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Estoque & Vencimento</h1>
      <p className="text-slate-500 mb-6">Selecione produtos para gerar uma solicitacao</p>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Buscar produto</label>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex: REQUEIJAO"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Classificacao</label>
          <select className="input" value={classe} onChange={(e) => setClasse(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(CLASSES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <button onClick={carregar} className="btn-primary">Filtrar</button>
      </div>

      {selKeys.length > 0 && podeCriar && (
        <div className="card p-4 mb-4 border-brand/30 bg-brand-50/40">
          <div className="font-semibold text-slate-800 mb-3">
            {selKeys.length} item(s) selecionado(s) - {grupos.length} cliente(s)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select className="input" value={tipoSolic} onChange={(e) => setTipoSolic(e.target.value)}>
                <option value="rebaixa">Rebaixa</option>
                <option value="oferta_interna">Oferta interna</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={enviar} className="btn-primary" disabled={enviando}>
              {enviando ? "Enviando..." : "Criar solicitacao"}
            </button>
            <button onClick={() => setSelecionados({})} className="btn-secondary">Limpar</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              {podeCriar && <th className="px-3 py-2 w-10"></th>}
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2">Validade</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2">Classe</th>
              <th className="px-3 py-2">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Carregando...</td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Nenhum item</td></tr>
            ) : (
              itens.map((it) => {
                const cls = CLASSES[it.classificacao] || CLASSES.ok;
                return (
                  <tr key={it._id} className="border-t border-slate-100 hover:bg-slate-50">
                    {podeCriar && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selecionados[it._id]}
                          onChange={() => toggleSel(it)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{it.cliente}</div>
                      <div className="text-xs text-slate-500">Cod {it.clienteCodigo}</div>
                    </td>
                    <td className="px-3 py-2">{it.produto}</td>
                    <td className="px-3 py-2 text-right">{it.quantidade}</td>
                    <td className="px-3 py-2">{fmtData(it.dataValidade)}</td>
                    <td className="px-3 py-2 text-right">{it.diasParaVencer ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`badge border ${cls.color}`}>{cls.label}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtData(it.eventDth)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
