import React from "react";
import { useOutletContext } from "react-router-dom";
import { slateDate } from "../utils/dates";
import type { LayoutContext } from "../layouts/layoutContext";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho de página no formato de claquete: a linha de cima identifica a produção
 * (workspace) e o dia; o título lidera.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => {
  const context = useOutletContext<LayoutContext | undefined>();
  const today = new Date();

  return (
    <header className="page-header">
      <div className="page-header-main">
        <p className="page-slate">
          {context?.workspace && <span className="page-slate-workspace">{context.workspace.nome}</span>}
          <time dateTime={today.toISOString().slice(0, 10)}>{slateDate(today)}</time>
        </p>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
};
