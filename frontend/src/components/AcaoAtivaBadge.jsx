import Badge from "@/components/ui/Badge";

// "Em oferta" / "Em rebaixa": ja existe uma solicitacao ativa para este item.
export default function AcaoAtivaBadge({ ativa }) {
  if (!ativa) return null;
  const isOferta = ativa.tipo === "oferta_interna";
  return (
    <Badge
      tone={isOferta ? "info" : "chart3"}
      dot
      className="text-[10px] font-semibold"
      title={ativa.fimAcao ? `Até ${new Date(ativa.fimAcao).toLocaleDateString("pt-BR")}` : undefined}
    >
      {isOferta ? "Em oferta" : "Em rebaixa"}
    </Badge>
  );
}
