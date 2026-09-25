import { colors } from "@/styles/tokens";

// Tons semanticos. Todas as classes sao strings LITERAIS completas: o Tailwind
// so gera o que enxerga no codigo, entao nunca montar `bg-${tone}/10`.
export const TONE = {
  danger:    { text: "text-danger",      bg: "bg-danger/10",    border: "border-danger/30",    dot: "bg-danger",      solid: "bg-danger text-white",      hex: colors.danger },
  warning:   { text: "text-warning",     bg: "bg-warning/10",   border: "border-warning/30",   dot: "bg-warning",     solid: "bg-warning text-white",     hex: colors.warning },
  caution:   { text: "text-caution",     bg: "bg-caution/10",   border: "border-caution/30",   dot: "bg-caution",     solid: "bg-caution text-white",     hex: colors.caution },
  success:   { text: "text-success",     bg: "bg-success/10",   border: "border-success/30",   dot: "bg-success",     solid: "bg-success text-white",     hex: colors.success },
  info:      { text: "text-info",        bg: "bg-info/10",      border: "border-info/30",      dot: "bg-info",        solid: "bg-info text-white",        hex: colors.info },
  secondary: { text: "text-secondary",   bg: "bg-secondary/10", border: "border-secondary/30", dot: "bg-secondary",   solid: "bg-secondary text-white",   hex: colors.secondary.DEFAULT },
  primary:   { text: "text-primary",     bg: "bg-primary/10",   border: "border-primary/30",   dot: "bg-primary",     solid: "bg-primary text-white",     hex: colors.primary.DEFAULT },
  neutral:   { text: "text-neutral-600", bg: "bg-neutral-100",  border: "border-neutral-200",  dot: "bg-neutral-400", solid: "bg-neutral-700 text-white", hex: colors.neutral[500] },
  chart3:    { text: "text-chart-3",     bg: "bg-chart-3/10",   border: "border-chart-3/30",   dot: "bg-chart-3",     solid: "bg-chart-3 text-white",     hex: colors.chart[3] },
};

export function toneClasses(tone) {
  const t = TONE[tone] || TONE.neutral;
  return `${t.bg} ${t.text} ${t.border}`;
}

// Margem (%): >= 20 boa, >= 10 atencao, abaixo ruim, sem dado neutro.
export function toneMargem(v) {
  if (v == null || Number.isNaN(Number(v))) return "neutral";
  if (v >= 20) return "success";
  if (v >= 10) return "warning";
  return "danger";
}

// Paleta de graficos/redes: uma cor por rede, sempre com texto branco.
export const CHART = [
  { bg: "bg-chart-1",  text: "text-white", light: "bg-chart-1/10",  border: "border-chart-1/30",  hex: colors.chart[1] },
  { bg: "bg-chart-2",  text: "text-white", light: "bg-chart-2/10",  border: "border-chart-2/30",  hex: colors.chart[2] },
  { bg: "bg-chart-3",  text: "text-white", light: "bg-chart-3/10",  border: "border-chart-3/30",  hex: colors.chart[3] },
  { bg: "bg-chart-4",  text: "text-white", light: "bg-chart-4/10",  border: "border-chart-4/30",  hex: colors.chart[4] },
  { bg: "bg-chart-5",  text: "text-white", light: "bg-chart-5/10",  border: "border-chart-5/30",  hex: colors.chart[5] },
  { bg: "bg-chart-6",  text: "text-white", light: "bg-chart-6/10",  border: "border-chart-6/30",  hex: colors.chart[6] },
  { bg: "bg-chart-7",  text: "text-white", light: "bg-chart-7/10",  border: "border-chart-7/30",  hex: colors.chart[7] },
  { bg: "bg-chart-8",  text: "text-white", light: "bg-chart-8/10",  border: "border-chart-8/30",  hex: colors.chart[8] },
  { bg: "bg-chart-9",  text: "text-white", light: "bg-chart-9/10",  border: "border-chart-9/30",  hex: colors.chart[9] },
  { bg: "bg-chart-10", text: "text-white", light: "bg-chart-10/10", border: "border-chart-10/30", hex: colors.chart[10] },
  { bg: "bg-chart-11", text: "text-white", light: "bg-chart-11/10", border: "border-chart-11/30", hex: colors.chart[11] },
  { bg: "bg-chart-12", text: "text-white", light: "bg-chart-12/10", border: "border-chart-12/30", hex: colors.chart[12] },
  { bg: "bg-chart-13", text: "text-white", light: "bg-chart-13/10", border: "border-chart-13/30", hex: colors.chart[13] },
  { bg: "bg-chart-14", text: "text-white", light: "bg-chart-14/10", border: "border-chart-14/30", hex: colors.chart[14] },
  { bg: "bg-chart-15", text: "text-white", light: "bg-chart-15/10", border: "border-chart-15/30", hex: colors.chart[15] },
  { bg: "bg-chart-16", text: "text-white", light: "bg-chart-16/10", border: "border-chart-16/30", hex: colors.chart[16] },
];

// Oferta interna no calendario: cor fixa, neutra escura.
export const COR_OFERTA_INTERNA = { bg: "bg-neutral-900", text: "text-white", light: "bg-neutral-100", border: "border-neutral-300", hex: colors.neutral[900] };
