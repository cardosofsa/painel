import {
  LayoutDashboard,
  ScanBarcode,
  Receipt,
  Tag,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Boxes,
  Wallet,
  BookOpen,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";
import { IconeLampiao } from "@/components/ui/IconeLampiao";
import { ABAS, type AbaId } from "@/lib/acesso";

/** Ícone de cada aba. O catálogo em si (id, rótulo, rota) mora em `lib/acesso.ts`,
 * que o middleware também usa e por isso não pode importar ícone nenhum. */
/** Ícone lucide ou desenhado à mão (Vixe): os dois aceitam size/strokeWidth/className. */
export type IconeNav = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

const ICONES: Record<AbaId, IconeNav> = {
  dashboard: LayoutDashboard,
  pdv: ScanBarcode,
  vendas: Receipt,
  precificacao: Tag,
  produtos: Package,
  clientes: Users,
  fornecedores: Truck,
  compras: ShoppingCart,
  estoque: Boxes,
  financeiro: Wallet,
  catalogo: BookOpen,
  vixe: IconeLampiao,
  configuracoes: Settings,
};

export const NAV_ITEMS: { id: AbaId; href: string; label: string; icon: IconeNav }[] = ABAS.map((aba) => ({
  id: aba.id,
  href: aba.href,
  label: aba.label,
  icon: ICONES[aba.id],
}));

/**
 * Agrupamento visual da barra lateral, por segmento do negócio — puramente de
 * apresentação, não mexe em controle de acesso (isso continua em `lib/acesso.ts`, decidido
 * pela conta master). `dashboard` fica de fora: o acesso a ele passou a ser pelo logo, não
 * por um item de menu. `configuracoes` também fica de fora: é renderizado à parte, sempre
 * por último, igual já era o link de Administração do master.
 */
export const GRUPOS_NAV: { label: string | null; itens: AbaId[] }[] = [
  // Sem título: a Vixe é uma entrada só no menu; os segmentos dela (Alertas, Preço…)
  // ficam dentro da própria página, para não encher a barra lateral.
  { label: null, itens: ["vixe"] },
  { label: "Vendas", itens: ["pdv", "vendas", "catalogo"] },
  { label: "Produtos & Estoque", itens: ["precificacao", "produtos", "estoque"] },
  { label: "Compras", itens: ["compras", "fornecedores"] },
  { label: "Clientes & Financeiro", itens: ["clientes", "financeiro"] },
];
