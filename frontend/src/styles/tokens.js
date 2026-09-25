// Fonte unica dos tokens de design (ver App rebaixa/.claude/design-system-portavel.md).
// CommonJS porque o tailwind.config.js faz require daqui; o JSX importa normalmente.
// Regra: nenhum hex fora deste arquivo.

const neutral = {
  50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8",
  500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a", 950: "#020617",
};

const primary = {
  DEFAULT: "#073d83", 50: "#eef4fb", 100: "#d9e5f5", 200: "#b3cbeb", 300: "#7ea8dc",
  400: "#4a82c9", 500: "#073d83", 600: "#06336d", 700: "#052d61", 800: "#04244d", 900: "#031a38",
};

// Cor de ACAO da interface: botoes que gravam/avancam, item de navegacao ativo.
const secondary = {
  DEFAULT: "#015bb9", 50: "#edf5fd", 100: "#d6e7fa", 200: "#adcff5", 300: "#7db2ec",
  400: "#4a92dd", 500: "#015bb9", 600: "#014f9f", 700: "#01407f", 800: "#013262", 900: "#012448",
};

const colors = {
  primary,
  secondary,
  accent: { DEFAULT: "#f3f7fc", foreground: "#073d83" },
  tertiary: "#4a82c9",
  neutral,
  success: "#15803d",
  warning: "#b45309",
  caution: "#ca8a04", // faixa "atencao" (entre warning e success)
  danger: "#b91c1c",
  info: "#0369a1",
  chart: {
    1: "#4a82c9", 2: "#15803d", 3: "#7c3aed", 4: "#b45309", 5: "#be123c", 6: "#0e7490",
    7: "#0369a1", 8: "#4d7c0f", 9: "#9333ea", 10: "#c2410c", 11: "#0f766e", 12: "#a21caf",
    13: "#1d4ed8", 14: "#b91c1c", 15: "#65a30d", 16: "#475569",
  },
  gradient: { from: "#f5f9fd", via: "#e6f0fa", to: "#cfe0f2" },
};

// Alias temporario: `brand` aponta pra cor de acao para os ~240 usos existentes
// migrarem sem tocar JSX. Removido na ultima fase do rebrand.
colors.brand = { ...secondary };

const radius = { sm: "8px", md: "12px", lg: "16px" };

const shadow = {
  float: "0 8px 16px -4px rgba(16,24,40,.18), 0 4px 6px -2px rgba(16,24,40,.12)",
};

module.exports = { colors, radius, shadow };
