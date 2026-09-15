import {
  LayoutDashboard,
  Tag,
  Package,
  Truck,
  ShoppingCart,
  Boxes,
  Wallet,
  BookOpen,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/precificacao", label: "Precificação", icon: Tag },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/catalogo", label: "Catálogo", icon: BookOpen },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
