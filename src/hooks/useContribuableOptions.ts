"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, type Paginated } from "@/lib/api-client";

export type ContribuableOption = { id: number; nom: string };

/** Charge la liste des contribuables actifs pour alimenter les listes déroulantes. */
export function useContribuableOptions() {
  return useQuery({
    queryKey: ["contribuable-options"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiGet<Paginated<ContribuableOption>>(
        "/api/contribuables?pageSize=100&sort=nom&order=asc&actif=true",
      );
      return res.data;
    },
  });
}
