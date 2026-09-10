import {
  LayoutDashboard,
  Users,
  FileText,
  ShieldCheck,
  HeartHandshake,
  FolderLock,
  BarChart3,
  ReceiptText,
  KeyRound,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission requise (ressource) pour afficher l'entrée ; undefined = toujours. */
  ressource?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/contribuables", label: "Contribuables", icon: Users, ressource: "contribuables" },
  { href: "/declarations", label: "Déclarations", icon: FileText, ressource: "declarations" },
  { href: "/cnps", label: "CNPS", icon: HeartHandshake, ressource: "cnps" },
  { href: "/acf", label: "ACF", icon: ShieldCheck, ressource: "acf" },
  { href: "/facturation", label: "Facturation", icon: ReceiptText, ressource: "factures" },
  { href: "/documents", label: "Documents", icon: FolderLock, ressource: "documents" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/utilisateurs", label: "Utilisateurs", icon: Users, ressource: "users" },
  { href: "/roles", label: "Rôles & permissions", icon: KeyRound, ressource: "roles" },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];
