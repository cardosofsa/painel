"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Delete, KeyRound, UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { entrarComoDono, entrarOperador, sairOperador } from "./actions";

type Alvo = { tipo: "operador"; id: string; nome: string } | { tipo: "dono" };

/** Tela de turno: toca no nome, digita o PIN no teclado (bom no celular e no balcão). */
export function OperadorClient({ operadores, semMigracao, temPinAdmin, atual }: { operadores: { id: string; nome: string }[]; semMigracao: boolean; temPinAdmin: boolean; atual: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [pin, setPin] = useState("");

  function entrar(p = pin) {
    if (!alvo) return;
    startTransition(async () => {
      const r = alvo.tipo === "dono" ? await entrarComoDono(p) : await entrarOperador(alvo.id, p);
      if (!r.ok) {
        setPin("");
        return void toast.error(r.erro);
      }
      toast.success(alvo.tipo === "dono" ? "Turno do dono." : `Bom trabalho, ${alvo.nome}!`);
      router.replace(r.dado.destino);
      router.refresh();
    });
  }

  function digitar(d: string) {
    const novo = (pin + d).slice(0, 6);
    setPin(novo);
  }

  function sair() {
    startTransition(async () => {
      await sairOperador();
      router.refresh();
    });
  }

  if (semMigracao)
    return (
      <Card className="p-5 text-sm text-text-secondary">
        Operadores precisam da migração <span className="font-mono">0063_operadores.sql</span>.
      </Card>
    );

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="Quem está operando?" />
      {atual && (
        <p className="text-sm text-text-secondary mb-4">
          Agora: <strong className="text-text-primary">{atual}</strong>.{" "}
          <button type="button" className="text-accent hover:underline" onClick={sair}>
            Encerrar turno
          </button>
        </p>
      )}
      {!alvo ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {operadores.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => (setAlvo({ tipo: "operador", id: o.id, nome: o.nome }), setPin(""))}
              className="rounded-lg border border-border bg-surface-1 p-4 text-left hover:border-accent hover:bg-surface-2"
            >
              <UserRound size={22} className="text-accent mb-2" />
              <span className="block font-medium text-text-primary truncate">{o.nome}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAlvo({ tipo: "dono" });
              setPin("");
              if (!temPinAdmin) startTransition(async () => {
                const r = await entrarComoDono("");
                if (!r.ok) return void toast.error(r.erro);
                router.replace(r.dado.destino);
                router.refresh();
              });
            }}
            className="rounded-lg border border-dashed border-border p-4 text-left hover:border-accent hover:bg-surface-2"
          >
            <KeyRound size={22} className="text-text-tertiary mb-2" />
            <span className="block font-medium text-text-primary">Sou o dono</span>
            <span className="block text-[11px] text-text-tertiary">{temPinAdmin ? "Pede o PIN de administrador" : "Acesso a tudo"}</span>
          </button>
          {operadores.length === 0 && (
            <div className="col-span-2 sm:col-span-3">
              <EmptyState icon={UserRound} title="Nenhum operador cadastrado" description="Cadastre a equipe em Configurações → Equipe." />
            </div>
          )}
        </div>
      ) : (
        <Card className="max-w-xs mx-auto text-center">
          <div className="font-medium text-text-primary mb-1">{alvo.tipo === "dono" ? "Dono" : alvo.nome}</div>
          <div className="text-xs text-text-tertiary mb-3">{alvo.tipo === "dono" ? "PIN de administrador" : "Digite seu PIN"}</div>
          <div className="flex justify-center gap-2 mb-4" aria-label="PIN digitado">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? "bg-accent" : "bg-surface-2 border border-border"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => digitar(d)} className="h-12 rounded-md border border-border text-lg font-mono hover:bg-surface-2">
                {d}
              </button>
            ))}
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Apagar" className="h-12 rounded-md border border-border flex items-center justify-center hover:bg-surface-2">
              <Delete size={18} />
            </button>
            <button type="button" onClick={() => digitar("0")} className="h-12 rounded-md border border-border text-lg font-mono hover:bg-surface-2">
              0
            </button>
            <Button variant="primary" className="h-12" loading={pending} disabled={pin.length < 4} onClick={() => entrar()}>
              OK
            </Button>
          </div>
          <button type="button" className="text-xs text-text-tertiary hover:text-text-primary" onClick={() => setAlvo(null)}>
            Voltar
          </button>
        </Card>
      )}
    </div>
  );
}
