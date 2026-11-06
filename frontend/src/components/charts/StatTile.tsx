import React from "react";

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}

/** Número de destaque (KPI) usado nas páginas de métricas */
export const StatTile: React.FC<StatTileProps> = ({ icon, label, value, hint }) => (
  <div className="stat-tile">
    <span className="stat-tile-icon">{icon}</span>
    <span className="stat-tile-label">{label}</span>
    <strong className="stat-tile-value">{value}</strong>
    {hint && <span className="stat-tile-hint">{hint}</span>}
  </div>
);
