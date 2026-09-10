"use client";

import { useSession } from "next-auth/react";
import { hasPermission, type Action } from "@/lib/permissions";

/** Hook client : retourne une fonction de test de permission depuis la session. */
export function useCan() {
  const { data } = useSession();
  return (ressource: string, action: Action) =>
    hasPermission(data?.user?.permissions, ressource, action);
}
