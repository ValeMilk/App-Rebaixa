import Badge from "@/components/ui/Badge";
import { IcoBoxOff } from "@/components/Icons";
import { fmtDataHoraCurta } from "@/lib/utils";
import { SITUACAO } from "@/components/visao/situacoes";

// "2026-10-05T14:32" -> "05/10"
function diaCurto(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : null;
}

/**
 * Selo da situacao do item. "Nao contado" leva a data da ultima contagem (ou "nunca contado");
 * ruptura leva o icone de caixa vazia.
 */
export default function SituacaoBadge({ item, className }) {
  const s = SITUACAO[item.situacao] || SITUACAO.sem_shelf;
  let texto = s.label;
  if (item.situacao === "nao_contado") {
    const dia = diaCurto(item.ultimaContagemEm);
    texto = dia ? `Não contado · última contagem ${dia}` : "Não contado · nunca contado";
  }
  return (
    <Badge tone={s.tone} dot={item.situacao !== "ruptura"} className={className} title={item.ultimaContagemEm ? `Última contagem ${fmtDataHoraCurta(item.ultimaContagemEm)}` : undefined}>
      {item.situacao === "ruptura" && <IcoBoxOff className="h-3 w-3" aria-hidden />}
      {texto}
    </Badge>
  );
}
