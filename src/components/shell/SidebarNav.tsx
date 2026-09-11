"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { hasPermission, type RolePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Navigation latérale, filtrée par les permissions de l'utilisateur.
 *
 * Les permissions arrivent en props, depuis la mise en page serveur qui les a
 * déjà chargées pour décider de l'accès. La version précédente les relisait
 * côté client via `useSession()`, avec deux conséquences : le premier rendu ne
 * connaissait encore aucune permission, et n'affichait donc que les trois
 * entrées libres avant de faire apparaître les neuf autres ; et le menu
 * dépendait d'un contexte React dont l'absence fait *lever* `useSession`, ce
 * qui n'a rien à faire dans un composant de navigation.
 */
export function SidebarNav({
  permissions,
  onNavigate,
}: {
  permissions: RolePermission[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter(
    (item) =>
      !item.ressource || hasPermission(permissions, item.ressource, "read"),
  );

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
