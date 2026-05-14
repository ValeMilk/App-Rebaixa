"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

const ROLES = ["supervisor", "diretoria", "admin"];

export default function UsuariosPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ nome: "", email: "", codigo: "", role: "supervisor" });
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

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/users/${editId}`, form);
      } else {
        await api.post("/users", form);
      }
      setForm({ nome: "", email: "", codigo: "", role: "supervisor" });
      setEditId(null);
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  function editar(u) {
    setEditId(u._id);
    setForm({ nome: u.nome, email: u.email, codigo: u.codigo, role: u.role });
  }

  async function desativar(u) {
    if (!confirm(`Desativar ${u.nome}?`)) return;
    await api.delete(`/users/${u._id}`);
    carregar();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Usuarios</h1>
      <p className="text-slate-500 mb-6">Cadastre supervisores, diretoria e admins. A senha eh igual ao codigo.</p>

      <form onSubmit={salvar} className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <input className="input" placeholder="Nome" value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className="input" type="email" placeholder="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="input" placeholder="Codigo" value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn-primary" type="submit">{editId ? "Atualizar" : "Cadastrar"}</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Codigo</th>
              <th className="px-3 py-2">Perfil</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Carregando...</td></tr>
            ) : users.map((u) => (
              <tr key={u._id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{u.nome}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.codigo}</td>
                <td className="px-3 py-2 capitalize">{u.role}</td>
                <td className="px-3 py-2">{u.ativo ? "Sim" : "Nao"}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => editar(u)} className="text-brand hover:underline text-sm">Editar</button>
                  {u.ativo && (
                    <button onClick={() => desativar(u)} className="text-red-600 hover:underline text-sm">
                      Desativar
                    </button>
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
