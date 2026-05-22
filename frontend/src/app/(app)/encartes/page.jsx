"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  IcoChevronDown,
  IcoChevronRight,
  IcoX,
  IcoCalendar,
  IcoUsers,
  IcoClipboard,
} from "@/components/Icons";

function fmtBRL(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function NovoEncarteModal({ codigoRede, redeSubrede, onClose, onCriado }) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) { setErro("Informe o nome do encarte"); return; }
    if (!inicio || !fim) { setErro("Informe o período (início e fim)"); return; }
    if (new Date(fim) < new Date(inicio)) { setErro("Fim não pode ser anterior ao início"); return; }
    setSalvando(true);
    try {
      const { data } = await api.post("/encartes", {
        nome: nome.trim(),
        codigoRede,
        periodoInicio: inicio,
        periodoFim: fim,
      });
      onCriado(data);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao criar encarte");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-semibold text-brand uppercase tracking-wider">Novo Encarte</div>
            <h2 className="font-bold text-slate-900 text-base">{redeSubrede || codigoRede}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
            <IcoX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do encarte</label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder="Ex: Encarte Junho 2026"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Início</label>
              <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fim</label>
              <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>

          {erro && <p className="text-red-600 text-xs">{erro}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition disabled:opacity-60">
              {salvando ? "Salvando..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GrupoRede({ grupo, onNovoEncarte, onClickEncarte }) {
  const [aberto, setAberto] = useState(true);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header da rede */}
      <button
        onClick={() => setAberto((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IcoUsers className="w-4 h-4 text-brand shrink-0" />
          <span className="font-bold text-slate-800 text-sm truncate">
            {grupo.redeSubrede || grupo.codigoRede}
          </span>
          <span className="text-xs text-slate-400 font-medium shrink-0">
            {grupo.encartes.length} encarte{grupo.encartes.length !== 1 ? "s" : ""}
          </span>
        </div>
        {aberto
          ? <IcoChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <IcoChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </button>

      {aberto && (
        <div className="border-t border-slate-100">
          {/* Lista de encartes */}
          {grupo.encartes.length === 0 ? (
            <div className="px-4 py-4 text-center text-slate-400 text-sm">Nenhum encarte ainda</div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {grupo.encartes.map((enc) => (
                <li key={enc._id}>
                  <button
                    onClick={() => onClickEncarte(enc._id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
                  >
                    <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                      <IcoClipboard className="w-4 h-4 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm truncate">{enc.nome}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <IcoCalendar className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500">
                          {fmtData(enc.periodoInicio)} → {fmtData(enc.periodoFim)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {!enc.podeEditar && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                          Visualização
                        </span>
                      )}
                      <IcoChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Botão novo encarte — só quem pode editar no grupo */}
          {grupo.podeEditar && (
            <div className="px-4 py-3 border-t border-slate-50">
              <button
                onClick={() => onNovoEncarte(grupo)}
                className="w-full py-2 rounded-xl border-2 border-dashed border-brand/30 text-brand text-sm font-semibold hover:bg-brand/5 transition"
              >
                + Novo encarte
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EncartesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalRede, setModalRede] = useState(null); // { codigoRede, redeSubrede }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/encartes");
      setGrupos(data.grupos || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function handleCriado(novoEncarte) {
    // Redireciona direto para o encarte criado para montar os itens
    router.push(`/encartes/${novoEncarte._id}`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 safe-area-pt">
        <h1 className="font-bold text-slate-900 text-lg leading-tight">Agenda de Encartes</h1>
        <p className="text-slate-500 text-xs mt-0.5">Encartes agendados por rede</p>
      </div>

      <div className="flex-1 p-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
          </div>
        ) : grupos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <IcoClipboard className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold">Nenhuma rede encontrada</p>
            <p className="text-slate-400 text-sm mt-1">
              {user?.role === "supervisor"
                ? "Você não possui redes na carteira ainda."
                : "Nenhum encarte cadastrado."}
            </p>
          </div>
        ) : (
          grupos.map((g) => (
            <GrupoRede
              key={g.codigoRede}
              grupo={g}
              onNovoEncarte={(grupo) => setModalRede({ codigoRede: grupo.codigoRede, redeSubrede: grupo.redeSubrede })}
              onClickEncarte={(id) => router.push(`/encartes/${id}`)}
            />
          ))
        )}
      </div>

      {modalRede && (
        <NovoEncarteModal
          codigoRede={modalRede.codigoRede}
          redeSubrede={modalRede.redeSubrede}
          onClose={() => setModalRede(null)}
          onCriado={handleCriado}
        />
      )}
    </div>
  );
}
