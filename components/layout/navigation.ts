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
  type LucideIcon,
} from "lucide-react";
import { ABAS, type AbaId } from "@/lib/acesso";

/** Ícone de cada aba. O catálogo em si (id, rótulo, rota) mora em `lib/acesso.ts`,
 * que o middleware também usa e por isso não pode importar ícone nenhum. */
const ICONES: Record<AbaId, LucideIcon> = {
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
  configuracoes: Settings,
};

export const NAV_ITEMS: { id: AbaId; href: string; label: string; icon: LucideIcon }[] = ABAS.map((aba) => ({
  id: aba.id,
  href: aba.href,
  label: aba.label,
  icon: ICONES[aba.id],
}));
