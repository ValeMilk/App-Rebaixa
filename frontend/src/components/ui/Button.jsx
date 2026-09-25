"use client";

import clsx from "clsx";

// `default` = cor de ACAO (secondary): grava, envia, avanca.
const VARIANTES = {
  default: "bg-secondary text-white hover:bg-secondary-600",
  secondary: "bg-accent text-primary hover:bg-primary/10",
  outline: "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
  ghost: "text-neutral-700 hover:bg-accent hover:text-primary",
  destructive: "bg-danger text-white hover:bg-danger/90",
  link: "h-auto px-0 text-secondary underline-offset-4 hover:underline",
};

const TAMANHOS = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6 text-base",
  icon: "h-10 w-10 px-0",
  "icon-sm": "h-8 w-8 px-0",
};

export default function Button({ variant = "default", size = "default", className, type = "button", ...props }) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        VARIANTES[variant] || VARIANTES.default,
        TAMANHOS[size] || TAMANHOS.default,
        className
      )}
      {...props}
    />
  );
}
