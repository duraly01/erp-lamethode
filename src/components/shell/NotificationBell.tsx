"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Clock, AlertTriangle, Info } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatDateFR } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Notif = {
  id: number;
  type: "RAPPEL" | "ALERTE" | "INFO";
  message: string;
  lu: boolean;
  createdAt: string;
};

const ICONS = {
  RAPPEL: Clock,
  ALERTE: AlertTriangle,
  INFO: Info,
};
const TONES = {
  RAPPEL: "text-info",
  ALERTE: "text-danger",
  INFO: "text-primary",
};

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiGet<{ data: Notif[]; unreadCount: number }>("/api/notifications"),
    refetchInterval: 60_000,
  });

  const markAll = useMutation({
    mutationFn: () => apiSend("/api/notifications/read-all", "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: number) => apiSend(`/api/notifications/${id}`, "PATCH"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = data?.unreadCount ?? 0;
  const items = data?.data ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-foreground">
              Notifications
            </p>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout lire
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune notification.
              </p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type];
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.lu && markOne.mutate(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/40",
                      !n.lu && "bg-primary/5",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONES[n.type])} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          n.lu ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateFR(n.createdAt)}
                      </p>
                    </div>
                    {!n.lu && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
