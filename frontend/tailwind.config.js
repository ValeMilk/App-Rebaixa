const t = require("./src/styles/tokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: t.colors,
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // lg = inputs/botoes, xl = cards/paineis/tabela, 2xl = dialogos/toasts
      borderRadius: { lg: t.radius.sm, xl: t.radius.md, "2xl": t.radius.lg },
      boxShadow: { float: t.shadow.float },
      ringColor: { DEFAULT: t.colors.primary[400] },
      borderColor: { DEFAULT: "rgba(0, 0, 0, 0.1)" },
      backgroundImage: {
        page: `linear-gradient(180deg, ${t.colors.gradient.from} 0%, ${t.colors.gradient.via} 45%, ${t.colors.gradient.to} 100%)`,
      },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ":root": {
          "--primary": t.colors.primary.DEFAULT,
          "--secondary": t.colors.secondary.DEFAULT,
          "--accent": t.colors.accent.DEFAULT,
          "--r-sm": t.radius.sm,
          "--r-md": t.radius.md,
          "--r-lg": t.radius.lg,
        },
      }),
  ],
};
