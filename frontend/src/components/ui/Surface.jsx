import clsx from "clsx";

// Superficie unica: "isto e um bloco de conteudo". Sem sombra decorativa.
export default function Surface({ as: Tag = "div", className, ...props }) {
  return <Tag className={clsx("rounded-xl border border-neutral-200 bg-white", className)} {...props} />;
}
