"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { init, token, loading } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loading) return;
    if (token) redirect("/dashboard");
    else redirect("/login");
  }, [loading, token]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-slate-500">Carregando...</p>
    </div>
  );
}
