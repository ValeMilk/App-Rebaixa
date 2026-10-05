"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTituloDaPagina } from "@/components/PageTitleContext";
import { useAuth } from "@/lib/auth";
import { rotaInicial } from "@/lib/nav";
import Surface from "@/components/ui/Surface";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { IcoLock } from "@/components/Icons";

// Para onde vai quem esta logado mas cujo perfil nao tem nenhuma tela liberada.
export default function SemAcessoPage() {
  useTituloDaPagina("Sem acesso");
  const router = useRouter();
  const { user, logout } = useAuth();
  const inicio = rotaInicial(user);

  // Se o admin liberar alguma tela, sai daqui sozinho
  useEffect(() => { if (inicio) router.replace(inicio); }, [inicio, router]);

  return (
    <Surface>
      <EmptyState
        icon={IcoLock}
        titulo="Seu perfil não tem nenhuma tela liberada"
        descricao="Peça a um administrador para liberar o acesso na tela de Permissões."
        acao={<Button variant="outline" size="sm" onClick={logout}>Sair</Button>}
      />
    </Surface>
  );
}
