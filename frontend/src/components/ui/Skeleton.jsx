import clsx from "clsx";

export default function Skeleton({ className }) {
  return <div className={clsx("animate-pulse rounded-lg bg-neutral-200", className)} aria-hidden />;
}
