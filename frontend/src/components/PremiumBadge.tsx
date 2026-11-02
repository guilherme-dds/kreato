import React from "react";
import { Sparkles, Crown } from "lucide-react";
import type { Plan } from "../types";
import { PLAN_LABELS } from "../utils/plans";

interface PremiumBadgeProps {
  plan: Plan;
  size?: "sm" | "md" | "lg";
  showIconOnly?: boolean;
}

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({ plan, size = "md", showIconOnly = false }) => {
  const sizeClasses = {
    sm: "premium-badge-sm",
    md: "premium-badge-md",
    lg: "premium-badge-lg",
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 18,
  };

  return (
    <span className={`premium-badge ${sizeClasses[size]}`} title={`Assinante do plano ${PLAN_LABELS[plan]}`}>
      <Crown size={iconSizes[size]} className="premium-badge-icon" />
      {!showIconOnly && <span className="premium-badge-text">{plan}</span>}
      <Sparkles size={iconSizes[size] - 2} className="premium-badge-sparkle" />
    </span>
  );
};
