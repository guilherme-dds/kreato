import React from "react";
import { Crown } from "lucide-react";

interface UsageBarProps {
  used: number;
  limit: number;
  /** Ex.: "ideias ativas no plano Gratuito" */
  label: string;
  upgradeLabel: string;
  onUpgrade: () => void;
}

/** Uso de um recurso limitado pelo plano, com chamada para upgrade */
export const UsageBar: React.FC<UsageBarProps> = ({ used, limit, label, upgradeLabel, onUpgrade }) => {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const level = percent >= 100 ? "is-full" : percent >= 80 ? "is-warning" : "";

  return (
    <div className={`usage-bar ${level}`}>
      <div className="usage-bar-info">
        <span>
          <strong>{used}</strong> de {limit} {label}
        </span>
        <button className="usage-bar-upgrade" onClick={onUpgrade}>
          <Crown size={14} /> {upgradeLabel}
        </button>
      </div>
      <div
        className="usage-bar-track"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div className="usage-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};
