import React from "react";

export interface TooltipRow {
  label: string;
  value: string;
}

interface ChartTooltipProps {
  title: string;
  rows: TooltipRow[];
}

/** Tooltip escuro compartilhado pelos gráficos; textos sempre em tokens de texto, nunca na cor da série */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({ title, rows }) => (
  <div className="chart-tooltip">
    <div className="chart-tooltip-title">{title}</div>
    {rows.map((row) => (
      <div key={row.label} className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" />
        <span className="chart-tooltip-label">{row.label}</span>
        <span className="chart-tooltip-value">{row.value}</span>
      </div>
    ))}
  </div>
);

export const ChartEmpty: React.FC<{ message: string }> = ({ message }) => <div className="chart-empty">{message}</div>;
