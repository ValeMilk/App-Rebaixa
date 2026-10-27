"use client";

import Dialog from "@/components/ui/Dialog";
import Sidebar from "@/components/shell/Sidebar";

// A MESMA sidebar do desktop, como painel lateral no celular.
export default function NavSheet({ open, onClose, user, itens, ativo, badges, onLogout }) {
  return (
    <Dialog open={open} onClose={onClose} side="left" ariaLabel="Menu">
      <Sidebar variant="sheet" user={user} itens={itens} ativo={ativo} badges={badges} onNavigate={onClose} onLogout={onLogout} />
    </Dialog>
  );
}
