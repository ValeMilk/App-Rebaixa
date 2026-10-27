"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { IcoBell, IcoX } from "@/components/Icons";
import { estadoPush, ativarPush, precisaInstalarIos, bannerDispensado, dispensarBanner } from "@/lib/push";

/**
 * Convite para ativar as notificacoes push.
 * - `compacto`: uma linha discreta no topo do shell (some ao dispensar; a dispensa fica no localStorage)
 * - padrao: bloco na tela de pendencias (sempre aparece enquanto nao estiver ativo)
 */
export default function AtivarPushBanner({ compacto = false }) {
  const [estado, setEstado] = useState(null); // null = conferindo
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [dispensado, setDispensado] = useState(true);

  useEffect(() => {
    let vivo = true;
    setDispensado(compacto ? bannerDispensado() : false);
    estadoPush().then((e) => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, [compacto]);

  if (!estado || estado === "ativo" || dispensado) return null;
  if (compacto && estado === "negado") return null;

  const ios = estado === "sem_suporte" && precisaInstalarIos();
  if (estado === "sem_suporte" && !ios) return null; // navegador sem push: nada a fazer

  async function ativar() {
    setOcupado(true);
    setErro("");
    try {
      setEstado(await ativarPush());
    } catch (err) {
      setErro(err?.response?.data?.error || err.message || "Não foi possível ativar.");
      if (err?.estado === "negado") setEstado("negado");
    } finally {
      setOcupado(false);
    }
  }

  function dispensar() {
    dispensarBanner();
    setDispensado(true);
  }

  const texto = ios
    ? "Instale o InfoVale na tela inicial para receber notificações."
    : estado === "negado"
      ? "As notificações estão bloqueadas neste navegador. Libere nas configurações do site para receber as pendências."
      : "Receba um aviso no celular quando uma loja da sua carteira entrar em giro, rebaixa ou ruptura.";

  if (compacto) {
    return (
      <div className="flex items-center gap-2 border-b border-secondary/20 bg-secondary/5 px-4 py-1.5 text-xs text-neutral-700 md:px-6 lg:px-8" role="status">
        <IcoBell className="h-4 w-4 shrink-0 text-secondary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{erro || texto}</span>
        {!ios && (
          <button type="button" onClick={ativar} disabled={ocupado} className="shrink-0 font-semibold text-secondary hover:underline disabled:opacity-50">
            {ocupado ? "Ativando..." : "Ativar"}
          </button>
        )}
        <button type="button" onClick={dispensar} aria-label="Dispensar" className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700">
          <IcoX className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="surface flex flex-col gap-3 border-secondary/30 bg-secondary/5 p-4 sm:flex-row sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary" aria-hidden>
        <IcoBell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">Notificações no celular</p>
        <p className="mt-0.5 text-xs text-neutral-600">{texto}</p>
        {erro && <p role="alert" className="mt-1 text-xs text-danger">{erro}</p>}
      </div>
      {!ios && estado !== "negado" && (
        <Button size="sm" onClick={ativar} disabled={ocupado} className="shrink-0">
          {ocupado ? "Ativando..." : "Ativar notificações"}
        </Button>
      )}
    </div>
  );
}
