"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Entrada suave ao rolar. O HTML do servidor já vem visível: só o que está FORA da tela
 * na montagem é escondido e volta quando entra — sem JavaScript (ou com
 * `prefers-reduced-motion`), nada some. Estado vai no `data-revelar`, não em `useState`,
 * para não re-renderizar a página inteira a cada seção.
 */
export function Revelar({ children, className = "", atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return; // já está na tela
    el.dataset.revelar = "aguardando";
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.revelar = "visivel";
        obs.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`revelar ${className}`} style={atraso ? { transitionDelay: `${atraso}ms` } : undefined}>
      {children}
    </div>
  );
}

/** Número que "conta" de 0 até o valor quando aparece. O texto final já vem do servidor. */
export function Contador({ valor, sufixo = "" }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let quadro = 0;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const inicio = performance.now();
      const passo = (t: number) => {
        const p = Math.min(1, (t - inicio) / 900);
        const suave = 1 - Math.pow(1 - p, 3);
        el.textContent = `${Math.round(valor * suave)}${sufixo}`;
        if (p < 1) quadro = requestAnimationFrame(passo);
      };
      quadro = requestAnimationFrame(passo);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [valor, sufixo]);
  return (
    <span ref={ref}>
      {valor}
      {sufixo}
    </span>
  );
}
