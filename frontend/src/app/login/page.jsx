"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import Image from "next/image";
import { IcoChevronDown } from "@/components/Icons";

function IcoEye({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function IcoArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Painel esquerdo — logo */}
      <div className="bg-brand flex flex-col items-center justify-center md:w-1/2 py-16 px-8">
        <div className="flex flex-col items-center gap-6">
          {/* Coloque logo.png ou logo.svg em frontend/public/ */}
          <Image
            src="/logo.png"
            alt="Logo"
            width={220}
            height={120}
            className="object-contain drop-shadow-lg"
            priority
          />
          <p className="text-white/80 text-sm tracking-wide text-center">
            Sistema de Gestão de Rebaixas
          </p>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-col items-center justify-center md:w-1/2 bg-white px-8 py-14 safe-area-pt safe-area-pb">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Bem-vindo</h1>
          <p className="text-slate-500 text-sm mb-8">Faça login para continuar</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Usuário */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <select
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                >
                  <option value="">Selecione o usuário</option>
                  {usuarios.map((u) => (
                    <option key={u.email} value={u.email}>{u.nome}</option>
                  ))}
                </select>
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <IcoChevronDown className="w-4 h-4" />
                </span>
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  inputMode="numeric"
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  tabIndex={-1}
                >
                  <IcoEye open={mostrarSenha} />
                </button>
              </div>
            </div>

            {erro && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-brand text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[.98] transition disabled:opacity-60 mt-1"
            >
              {loading ? "Entrando..." : <><IcoArrow /> Entrar</>}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            © {new Date().getFullYear()} Valemilk — Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
