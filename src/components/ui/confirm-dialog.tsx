"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Dialogue de confirmation réutilisable (suppression, désactivation, etc.). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Supprimer",
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={loading}>
          {loading && <Spinner />}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
