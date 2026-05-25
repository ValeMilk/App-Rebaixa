"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

const ALL_ROLES = ["vendedor", "supervisor", "diretoria", "admin"];
const ROLE_LABEL = { vendedor: "Vendedor", supervisor: "Supervisor", diretoria: "Diretoria", admin: "Admin" };

const formVazio = { nome: "", email: "", codigo: "", role: "supervisor", roles: [] };

export default function UsuariosPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(formVazio);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar(e) {
    e.preventDefault();
    // roles[] não deve conter o role principal (evitar duplicata)
    const rolesExtras = (form.roles || []).filter((r) => r !== form.role);
    try {
      if (editId) {
        await api.put(`/users/${editId}`, { ...form, roles: rolesExtras });
      } else {
        await api.post("/users", { ...form, roles: rolesExtras });
      }
      setForm(formVazio);
      setEditId(null);
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  function editar(u) {
    setEditId(u._id);
    setForm({ nome: u.nome, email: u.email, codigo: u.codigo, role: u.role, roles: u.roles || [] });
  }

  function cancelarEdicao() {
    setEditId(null);
    setForm(formVazio);
  }

  function toggleRoleExtra(r) {
    setForm((prev) => {
      const atual = prev.roles || [];
      return { ...prev, roles: atual.includes(r) ? atual.filter((x) => x !== r) : [...atual, r] };
    });
  }

  async function desativar(u) {
    if (!confirm(`Desativar ${u.nome}?`)) return;
    await api.delete(`/users/${u._id}`);
    carregar();
  }

  const rolesExtrasDisponiveis = ALL_ROLES.filter((r) => r !== form.role);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Usuários</h1>
      <p className="text-slate-500 mb-6">Gerencie usuários. A senha inicial é igual ao código.</p>

      <form onSubmit={salvar} className="card p-4 space-y-3 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="input" placeholder="Nome completo" value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input" placeholder="Código (= senha inicial)" value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, roles: [] })}>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>

        {/* Perfis adicionais */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Perfis adicionais <span className="text-slate-400 font-normal normal-case">(acesso combinado)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {rolesExtrasDisponiveis.map((r) => {
              const marcado = (form.roles || []).includes(r);
              return (
                <button
                  key={r} type="button"
                  onClick={() => toggleRoleExtra(r)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${marcado ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:border-brand/50"}`}
                >
                  {ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit">{editId ? "Atualizar" : "Cadastrar"}</button>
          {editId && (
            <button type="button" onClick={cancelarEdicao} className="btn-ghost">Cancelar</button>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Perfil principal</th>
              <th className="px-3 py-2">Perfis extras</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Carregando...</td></tr>
            ) : users.map((u) => (
              <tr key={u._id} className={`border-t border-slate-100 ${editId === u._id ? "bg-brand/5" : ""}`}>
                <td className="px-3 py-2 font-medium">{u.nome}</td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2">{u.codigo}</td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-brand/10 text-brand capitalize">
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(u.roles || []).filter((r) => r !== u.role).map((r) => (
                      <span key={r} className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 capitalize">
                        {ROLE_LABEL[r] || r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-semibold ${u.ativo ? "text-emerald-600" : "text-slate-400"}`}>
                    {u.ativo ? "Sim" : "Não"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => editar(u)} className="text-brand hover:underline text-sm">Editar</button>
                  {u.ativo && (
                    <button onClick={() => desativar(u)} className="text-red-600 hover:underline text-sm">Desativar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
