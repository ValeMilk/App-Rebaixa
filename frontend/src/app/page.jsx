"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { rotaInicial } from "@/lib/nav";

export default function Home() {
  const { init, token, loading, user } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loading) return;
    if (token && user) redirect(rotaInicial(user) || "/sem-acesso");
    else if (!loading && !token) redirect("/login");
  }, [loading, token, user]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-neutral-500">Carregando...</p>
    </div>
  );
}
