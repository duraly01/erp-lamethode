import { Badge } from "@/components/ui/badge";
import {
  STATUT_DECLARATION_LABELS,
  STATUT_DECLARATION_COLORS,
  STATUT_ACF_LABELS,
  STATUT_ACF_COLORS,
  REGIME_FISCAL_LABELS_COURTS,
  isEnRetard,
  type StatutDeclaration,
  type StatutAcf,
  type RegimeFiscal,
} from "@/lib/constants";

const REGIME_COLORS: Record<RegimeFiscal, string> = {
  REEL: "bg-info/10 text-info border-info/20",
  IGS: "bg-primary/10 text-primary border-primary/20",
};

/**
 * Badge de statut de déclaration/CNPS. Si `dateEcheance` est fournie, le retard
 * effectif est recalculé (A_FAIRE échu → EN_RETARD).
 */
export function DeclarationStatusBadge({
  statut,
  dateEcheance,
}: {
  statut: StatutDeclaration;
  dateEcheance?: string;
}) {
  const eff: StatutDeclaration =
    dateEcheance && isEnRetard(dateEcheance, statut) ? "EN_RETARD" : statut;
  return (
    <Badge className={STATUT_DECLARATION_COLORS[eff]}>
      {STATUT_DECLARATION_LABELS[eff]}
    </Badge>
  );
}

export function AcfStatusBadge({ statut }: { statut: StatutAcf }) {
  return (
    <Badge className={STATUT_ACF_COLORS[statut]}>
      {STATUT_ACF_LABELS[statut]}
    </Badge>
  );
}

/**
 * Badge de régime fiscal. Au régime IGS, la classe du barème est affichée
 * avec le régime : c'est elle qui détermine le forfait dû.
 */
export function RegimeBadge({
  regime,
  igsClasse,
}: {
  regime: RegimeFiscal;
  igsClasse?: number | null;
}) {
  const label =
    regime === "IGS" && igsClasse
      ? `IGS — classe ${igsClasse}`
      : REGIME_FISCAL_LABELS_COURTS[regime];
  return <Badge className={REGIME_COLORS[regime]}>{label}</Badge>;
}

export function ActifBadge({ actif }: { actif: boolean }) {
  return actif ? (
    <Badge className="border-success/20 bg-success/10 text-success">Actif</Badge>
  ) : (
    <Badge className="border-border bg-muted text-muted-foreground">
      Inactif
    </Badge>
  );
}
