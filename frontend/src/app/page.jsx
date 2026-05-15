"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

function homeFor(role) {
  if (role === "vendedor" || role === "supervisor") return "/estoque";
  return "/dashboard";
}

export default function Home() {
  const { init, token, loading, user } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loading) return;
    if (token && user) redirect(homeFor(user.role));
    else if (!loading && !token) redirect("/login");
  }, [loading, token, user]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-slate-500">Carregando...</p>
    </div>
  );
}
