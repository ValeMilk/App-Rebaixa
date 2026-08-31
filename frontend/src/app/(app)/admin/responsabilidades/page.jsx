"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";

export default function ResponsabilidadesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [itens, setItens] = useState([]);
  const [redes, setRedes] = useState([]);
  const [supervisores, setSupervisores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ codigoRede: "", supervisorId: "" });
  const [editId, setEditId] = useState(null);
  const [filtroRede, setFiltroRede] = useState("");

  // Proteger rota: apenas admin
  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.replace("/encartes");
    }
  }, [user, authLoading, router]);

  async function carregar() {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get("/responsaveis-rede"),
        api.get("/responsaveis-rede/redes-disponiveis"),
        api.get("/responsaveis-rede/supervisores-disponiveis"),
      ]);
      setItens(r1.data.responsaveis || []);
      setRedes(r2.data.redes || []);
      setSupervisores(r3.data.supervisores || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const redesJaCadastradas = useMemo(
    () => new Set(itens.filter((i) => i._id !== editId).map((i) => i.codigoRede)),
    [itens, editId]
  );
  const redesDisponiveisFiltradas = useMemo(
    () => redes.filter((r) => !redesJaCadastradas.has(r.codigoRede)),
    [redes, redesJaCadastradas]
  );

  async function salvar(e) {
    e.preventDefault();
    if (!form.supervisorId) { alert("Selecione um supervisor"); return; }
    if (!editId && !form.codigoRede) { alert("Selecione uma rede"); return; }
    try {
      if (editId) {
        await api.put(`/responsaveis-rede/${editId}`, { supervisorId: form.supervisorId });
      } else {
        await api.post("/responsaveis-rede", form);
      }
      setForm({ codigoRede: "", supervisorId: "" });
      setEditId(null);
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  function editar(r) {
    setEditId(r._id);
    setForm({ codigoRede: r.codigoRede, supervisorId: r.supervisorId });
  }

  function cancelarEdicao() {
    setEditId(null);
    setForm({ codigoRede: "", supervisorId: "" });
  }

  async function remover(r) {
    if (!confirm(`Remover responsabilidade de ${r.supervisorNome} pela rede ${r.redeSubrede || r.codigoRede}?`)) return;
    try {
      await api.delete(`/responsaveis-rede/${r._id}`);
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  const itensFiltrados = useMemo(() => {
    const q = filtroRede.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((r) =>
      (r.redeSubrede || "").toLowerCase().includes(q) ||
      (r.codigoRede || "").toLowerCase().includes(q) ||
      (r.supervisorNome || "").toLowerCase().includes(q)
    );
  }, [itens, filtroRede]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Responsabilidades de Rede</h1>
      <p className="text-slate-500 mb-6 max-w-3xl">
        Override opcional: define o <strong>supervisor responsável</strong> por uma rede.
        Quando cadastrado, este supervisor passa a ver TODAS as solicitações daquela rede e é o
        único que decide na etapa de supervisor. Demais supervisores com lojas dessa rede na
        carteira continuam vendo as próprias solicitações em modo leitura.
        Redes não listadas aqui seguem a regra padrão (carteira).
      </p>

      <form onSubmit={salvar} className="card p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 mb-6">
        <select
          className="input"
          value={form.codigoRede}
          onChange={(e) => setForm({ ...form, codigoRede: e.target.value })}
          disabled={!!editId}
        >
          <option value="">— Selecione a rede —</option>
          {editId && (
            <option value={form.codigoRede}>
              {itens.find((i) => i._id === editId)?.redeSubrede || form.codigoRede}
            </option>
          )}
          {!editId && redesDisponiveisFiltradas.map((r) => (
            <option key={r.codigoRede} value={r.codigoRede}>
              {r.redeSubrede || r.codigoRede} ({r.codigoRede})
            </option>
          ))}
        </select>

        <select
          className="input"
          value={form.supervisorId}
          onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}
        >
          <option value="">— Selecione o supervisor —</option>
          {supervisores.map((s) => (
            <option key={s._id} value={s._id}>{s.nome} ({s.codigo})</option>
          ))}
        </select>

        <button className="btn-primary whitespace-nowrap" type="submit">
          {editId ? "Atualizar" : "Cadastrar"}
        </button>
        {editId && (
          <button type="button" onClick={cancelarEdicao} className="btn-secondary whitespace-nowrap">
            Cancelar
          </button>
        )}
      </form>

      <div className="mb-3">
        <input
          className="input max-w-sm"
          placeholder="Filtrar por rede ou supervisor..."
          value={filtroRede}
          onChange={(e) => setFiltroRede(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-2">Rede</th>
              <th className="px-3 py-2">Código Rede</th>
              <th className="px-3 py-2">Supervisor Responsável</th>
              <th className="px-3 py-2">Código Sup.</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>Carregando...</td></tr>
            )}
            {!loading && itensFiltrados.length === 0 && (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>Nenhuma responsabilidade cadastrada.</td></tr>
            )}
            {!loading && itensFiltrados.map((r) => (
              <tr key={r._id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-800">{r.redeSubrede || "—"}</td>
                <td className="px-3 py-2 text-slate-500">{r.codigoRede}</td>
                <td className="px-3 py-2 text-slate-800">{r.supervisorNome}</td>
                <td className="px-3 py-2 text-slate-500">{r.supervisorCodigo}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => editar(r)} className="text-brand font-medium hover:underline mr-3">Editar</button>
                  <button onClick={() => remover(r)} className="text-red-600 font-medium hover:underline">Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
