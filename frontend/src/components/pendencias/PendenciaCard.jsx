"use client";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { fmtData, fmtDataHora, fmtDataHoraCurta, formatarRede } from "@/lib/utils";
import { IcoBoxOff, IcoAlert, IcoClock, IcoCheck } from "@/components/Icons";

export const EVENTO = {
  rebaixa: { label: "Rebaixa", tone: "danger", Icon: IcoAlert },
  giro: { label: "Giro", tone: "warning", Icon: IcoClock },
  ruptura: { label: "Ruptura", tone: "danger", Icon: IcoBoxOff },
};

const PAPEL = { vendedor: "vendedor", supervisor: "supervisor" };

function fmtDiaMes(d) {
  const s = fmtData(d);
  return s === "-" ? "" : s.slice(0, 5);
}

/** "Fulano criou rebaixa em 27/10" */
export function textoAcao(p, user) {
  const a = p.acao;
  if (!a?.tipo) return null;
  const quem = a.porUserId && user && String(a.porUserId) === String(user.id) ? "Você" : a.porNome || "Outro destinatário";
  const quando = a.em ? ` em ${fmtDiaMes(a.em)}` : "";
  if (a.tipo === "solicitacao") return `${quem} ${p.evento === "giro" ? "criou oferta interna" : "criou rebaixa"}${quando}`;
  if (a.tipo === "pedido_feito") return `${quem} marcou pedido feito${quando}`;
  if (a.tipo === "ja_resolvi") return `${quem} resolveu${quando}${a.motivo ? `: ${a.motivo}` : ""}`;
  return `${quem} agiu${quando}`;
}

/**
 * Card de uma pendencia. `nova` = nao estava vista quando a tela abriu (continua como "Nova" ate recarregar).
 * `podeSolicitar` controla o botao de rebaixa/oferta (permissao solicitacoes.criar).
 */
export default function PendenciaCard({ p, user, nova, podeSolicitar, ocupado, onSolicitar, onPedidoFeito, onJaResolvi }) {
  const ev = EVENTO[p.evento] || EVENTO.rebaixa;
  const Icon = ev.Icon;
  const acao = textoAcao(p, user);
  const rede = formatarRede({ redeSubrede: p.redeSubrede, codigoRede: p.codigoRede });
  const outro = p.outros?.[0];

  let estado;
  if (acao) estado = <Badge tone="success" dot>Com ação</Badge>;
  else if (p.superada) estado = <Badge tone="neutral">Superada</Badge>;
  else if (nova) estado = <Badge tone="secondary" solid>Nova</Badge>;
  else estado = <Badge tone="neutral">Vista</Badge>;

  return (
    <article className="surface flex flex-col gap-3 p-4" data-evento={p.evento}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ev.tone} solid className="gap-1">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {ev.label}
        </Badge>
        {estado}
        <span className="ml-auto text-xs text-neutral-500">enviada em {fmtDataHora(p.enviadaEm)}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-900">{p.cliente || p.clienteCodigo}</p>
        <p className="truncate text-xs text-neutral-500">
          {rede ? `${rede} · ` : ""}cód. {p.clienteCodigo}
        </p>
        <p className="mt-1.5 truncate text-sm text-neutral-800">{p.produto || p.produtoCodigo}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        {p.evento !== "ruptura" ? (
          <>
            <div>
              <dt className="text-neutral-500">Quantidade</dt>
              <dd className="font-medium tabular-nums text-neutral-800">{p.quantidade} un</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Validade</dt>
              <dd className="font-medium tabular-nums text-neutral-800">{fmtData(p.dataValidade)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Shelf consumido</dt>
              <dd className="font-medium tabular-nums text-neutral-800">{p.pctShelf != null ? `${Math.round(p.pctShelf * 100)}%` : "—"}</dd>
            </div>
          </>
        ) : (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-neutral-500">Contagem</dt>
            <dd className="font-medium text-neutral-800">Zero com ruptura marcada</dd>
          </div>
        )}
        <div>
          <dt className="text-neutral-500">Contado por</dt>
          <dd className="truncate font-medium text-neutral-800">
            {p.contadoPor || "—"} <span className="font-normal text-neutral-500">{p.contadoEm ? fmtDataHoraCurta(p.contadoEm) : ""}</span>
          </dd>
        </div>
      </dl>

      {(acao || outro) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {acao && (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <IcoCheck className="h-3.5 w-3.5" aria-hidden />
              {acao}
            </span>
          )}
          {outro && !acao && (
            <span className="text-neutral-500">
              {outro.nome} ({PAPEL[outro.papel] || outro.papel}) {outro.vistaEm ? `viu em ${fmtDiaMes(outro.vistaEm)}` : "ainda não viu"}
            </span>
          )}
        </div>
      )}

      {!acao && !p.superada && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {podeSolicitar && p.evento !== "ruptura" && (
            <Button size="sm" onClick={() => onSolicitar(p)} disabled={ocupado}>
              {p.evento === "giro" ? "Solicitar oferta" : "Solicitar rebaixa"}
            </Button>
          )}
          {p.evento === "ruptura" && (
            <Button size="sm" onClick={() => onPedidoFeito(p)} disabled={ocupado}>
              Marcar pedido feito
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onJaResolvi(p)} disabled={ocupado}>
            Já resolvi
          </Button>
        </div>
      )}
    </article>
  );
}
