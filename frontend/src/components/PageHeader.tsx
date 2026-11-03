import React from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, title, description, actions }) => (
  <header className="page-header">
    <div className="page-header-main">
      <div className="page-header-icon">
        <Icon size={22} />
      </div>
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);
