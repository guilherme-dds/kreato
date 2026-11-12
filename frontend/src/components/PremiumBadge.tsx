import React from "react";
import { Crown } from "lucide-react";
import type { Plan } from "../types";
import { PLAN_LABELS } from "../utils/plans";

interface PremiumBadgeProps {
  plan: Plan;
  size?: "sm" | "md" | "lg";
  showIconOnly?: boolean;
}

const ICON_SIZES = { sm: 11, md: 13, lg: 15 } as const;

/** Selo de plano pago: latão discreto, como a etiqueta de um equipamento */
export const PremiumBadge: React.FC<PremiumBadgeProps> = ({ plan, size = "md", showIconOnly = false }) => (
  <span className={`premium-badge premium-badge-${size}`} title={`Assinante do plano ${PLAN_LABELS[plan]}`}>
    <Crown size={ICON_SIZES[size]} className="premium-badge-icon" aria-hidden="true" />
    {showIconOnly ? <span className="sr-only">{PLAN_LABELS[plan]}</span> : <span>{PLAN_LABELS[plan]}</span>}
  </span>
);
