"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// Classificação visual
const CLS = {
  critico:  { label: "Crítico",  bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300",    dot: "bg-red-500" },
  alerta:   { label: "Alerta",   bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", dot: "bg-orange-500" },
  atencao:  { label: "Atenção",  bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-500" },
  ok:       { label: "Regular",  bg: "bg-green-100",  text: "text-green-700",  border: "border-green-200",  dot: "bg-green-500" },
  vencido:  { label: "Vencido",  bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200",  dot: "bg-slate-400" },
};

function Badge({ cls }) {
  const c = CLS[cls] || CLS.ok;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function fmtBRL(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcMargem(precoOferta, custo) {
  const p = Number(precoOferta);
  const c = Number(custo);
  if (!p || !c || p <= 0) return null;
  return ((p - c) / p) * 100;
}

function MargemBadge({ pct }) {
  if (pct == null) return <span className="text-slate-400 text-sm">—</span>;
  const cor = pct >= 20 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : pct >= 10 ? "text-yellow-700 bg-yellow-50 border-yellow-200" : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-block font-bold text-2xl px-4 py-1.5 rounded-xl border ${cor}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function RebaixaModal({ item, onClose, onEnviado }) {
  const [precoOferta, setPrecoOferta] = useState("");
  const [sellout, setSellout] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const margem = calcMargem(precoOferta, item.custo);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!precoOferta) { setErro("Informe o preço da oferta"); return; }
    setEnviando(true);
    try {
      await api.post("/solicitacoes", {
        tipo: "rebaixa",
        cliente: item.cliente,
        clienteCodigo: item.clienteCodigo,
        motivo,
        itens: [{
          produto: item.produto,
          produtoCodigo: item.produtoCodigo,
          quantidade: item.quantidade,
          dataValidade: item.dataValidade,
          diasParaVencer: item.diasParaVencer,
          precoTabela: item.precoTabela,
          precoOferta: Number(precoOferta),
          sellout: sellout ? Number(sellout) : undefined,
          margemCalculada: margem != null ? Math.round(margem * 10) / 10 : undefined,
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>
        <div className="px-5 pb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-900 text-lg leading-tight">{item.produto}</h2>
              <p className="text-slate-500 text-sm mt-0.5">{item.cliente}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 text-3xl leading-none ml-3 -mt-1">×</button>
          </div>

          <div className="flex gap-2 mb-5">
            <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500">Qtd</div>
              <div className="font-bold text-slate-800 text-xl">{item.quantidade}</div>
            </div>
            <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500">Vence em</div>
              <div className={`font-bold text-xl ${item.diasParaVencer <= 15 ? "text-red-600" : "text-slate-800"}`}>{item.diasParaVencer ?? "—"}d</div>
              <div className="text-xs text-slate-400">{fmtData(item.dataValidade)}</div>
            </div>
            <div className="flex-1 bg-brand/5 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500">Tabela</div>
              <div className="font-bold text-brand text-base">{fmtBRL(item.precoTabela)}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Preço da Oferta (R$)</label>
              <input
                type="number" step="0.01" min="0"
                className="input text-xl font-bold"
                value={precoOferta}
                onChange={(e) => setPrecoOferta(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Sellout — preço ao consumidor (R$)</label>
              <input
                type="number" step="0.01" min="0"
                className="input"
                value={sellout}
                onChange={(e) => setSellout(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>

            <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700 mb-0.5">Margem Valemilk</div>
                <div className="text-xs text-slate-400">{item.custo ? `Custo: ${fmtBRL(item.custo)}` : "Custo não disponível"}</div>
              </div>
              <MargemBadge pct={margem} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produto próximo ao vencimento"
              />
            </div>

            {erro && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{erro}</div>
            )}

            <button type="submit" className="btn-primary w-full py-3.5 text-base font-semibold" disabled={enviando}>
              {enviando ? "Enviando..." : "Solicitar Rebaixa"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProdutoCard({ item, onRebaixar }) {
  const c = CLS[item.classificacao] || CLS.ok;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${c.border} ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800 text-sm leading-tight truncate">{item.produto}</div>
        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
          <span>Qtd: <b>{item.quantidade}</b></span>
          <span>Vence: <b>{fmtData(item.dataValidade)}</b></span>
          {item.precoTabela && <span>Tab: <b>{fmtBRL(item.precoTabela)}</b></span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Badge cls={item.classificacao} />
        <button
          onClick={() => onRebaixar(item)}
          className="text-xs font-semibold text-brand border border-brand/30 bg-white px-3 py-1 rounded-lg hover:bg-brand/5 active:scale-95 transition"
        >
          Rebaixar
        </button>
      </div>
    </div>
  );
}

function LojaCard({ clienteCodigo, clienteNome, itens, expanded, onToggle, onRebaixar }) {
  const criticos = itens.filter((i) => i.classificacao === "critico").length;
  const alertas  = itens.filter((i) => i.classificacao === "alerta").length;
  const borda = criticos > 0 ? "border-red-300" : alertas > 0 ? "border-orange-300" : "border-slate-200";

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${borda}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 truncate">{clienteNome}</div>
          <div className="text-xs text-slate-500 mt-0.5">Cód {clienteCodigo} · {itens.length} produto{itens.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="flex gap-1.5 items-center">
          {criticos > 0 && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{criticos}×crit</span>}
          {alertas > 0 && <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{alertas}×alert</span>}
          <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
          {itens.map((item) => (
            <ProdutoCard key={item._id} item={item} onRebaixar={onRebaixar} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstoquePage() {
  const [itens, setItens] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [formItem, setFormItem] = useState(null);
  const [toast, setToast] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 1000 };
      if (q) params.q = q;
      const { data } = await api.get("/estoque", { params });
      setItens(data.itens || []);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { carregar(); }, []);

  const grupos = useMemo(() => {
    const map = new Map();
    for (const it of itens) {
      const k = it.clienteCodigo;
      if (!map.has(k)) map.set(k, { clienteCodigo: k, clienteNome: it.cliente, itens: [] });
      map.get(k).itens.push(it);
    }
    return Array.from(map.values()).sort((a, b) => {
      const score = (g) =>
        g.itens.filter((i) => i.classificacao === "critico").length * 100 +
        g.itens.filter((i) => i.classificacao === "alerta").length * 10 +
        g.itens.filter((i) => i.classificacao === "atencao").length;
      return score(b) - score(a);
    });
  }, [itens]);

  function toggleLoja(cod) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }

  function handleEnviado() {
    setToast("Solicitação enviada!");
    setTimeout(() => setToast(""), 3000);
  }

  const totCritico = itens.filter((i) => i.classificacao === "critico").length;
  const totAlerta  = itens.filter((i) => i.classificacao === "alerta").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Lojas</h1>
        <p className="text-slate-500 text-sm">Produtos próximos ao vencimento</p>
      </div>

      {!loading && (totCritico > 0 || totAlerta > 0) && (
        <div className="flex gap-2">
          {totCritico > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{totCritico}</div>
              <div className="text-xs text-red-600 font-medium">Críticos</div>
            </div>
          )}
          {totAlerta > 0 && (
            <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{totAlerta}</div>
              <div className="text-xs text-orange-600 font-medium">Alertas</div>
            </div>
          )}
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-slate-700">{grupos.length}</div>
            <div className="text-xs text-slate-500 font-medium">Lojas</div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto..."
          onKeyDown={(e) => e.key === "Enter" && carregar()}
        />
        <button onClick={carregar} className="btn-primary px-4">Buscar</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Nenhum produto encontrado</div>
      ) : (
        <div className="space-y-2">
          {grupos.map(({ clienteCodigo, clienteNome, itens: gItens }) => (
            <LojaCard
              key={clienteCodigo}
              clienteCodigo={clienteCodigo}
              clienteNome={clienteNome}
              itens={gItens}
              expanded={expanded.has(clienteCodigo)}
              onToggle={() => toggleLoja(clienteCodigo)}
              onRebaixar={setFormItem}
            />
          ))}
        </div>
      )}

      {formItem && (
        <RebaixaModal item={formItem} onClose={() => setFormItem(null)} onEnviado={handleEnviado} />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

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
