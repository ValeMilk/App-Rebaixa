"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { IcoUser, IcoLock, IcoChevronDown } from "@/components/Icons";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/auth/usuarios").then(({ data }) => {
      setUsuarios(data.users || []);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const u = await login(email, senha);
      const role = u?.role ?? "vendedor";
      router.replace(role === "vendedor" || role === "supervisor" ? "/estoque" : "/dashboard");
    } catch (err) {
      setErro(err.response?.data?.error || "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand via-brand-600 to-brand-700 safe-area-pt">
      {/* Header artístico */}
      <div className="flex-1 flex flex-col justify-end px-6 pb-8 pt-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/20">
            <span className="text-white text-xl font-black tracking-tight">VM</span>
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight">Rebaixa</h1>
            <p className="text-white/70 text-sm">Valemilk · Ofertas internas</p>
          </div>
        </div>
        <p className="text-white/80 text-sm mt-3">Acesse sua conta para acompanhar lojas e solicitar rebaixas.</p>
      </div>

      {/* Card branco com formulário */}
      <div className="bg-white rounded-t-[2rem] shadow-2xl px-6 pt-7 pb-10 safe-area-pb">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Usuário</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <IcoUser className="w-5 h-5" />
              </span>
              <select
                className="input pl-10 pr-10 appearance-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              >
                <option value="">Selecione seu nome...</option>
                {usuarios.map((u) => (
                  <option key={u.email} value={u.email}>{u.nome}</option>
                ))}
              </select>
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <IcoChevronDown className="w-4 h-4" />
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Código</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <IcoLock className="w-5 h-5" />
              </span>
              <input
                type="password"
                inputMode="numeric"
                className="input pl-10"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Seu código de acesso"
                required
              />
            </div>
          </div>

          {erro && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-700 animate-fade-in">
              {erro}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3.5 text-base mt-2" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-center text-xs text-slate-400 pt-4">
            © {new Date().getFullYear()} Valemilk
          </p>
        </form>
      </div>
    </div>
  );
}
