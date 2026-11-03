import React from "react";
import { Construction, type LucideIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

interface ComingSoonPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ icon, title, description, children }) => (
  <div className="page">
    <PageHeader icon={icon} title={title} description={description} />

    <div className="coming-soon-card">
      <div className="coming-soon-icon">
        <Construction size={30} />
      </div>
      <h3>Em construção</h3>
      <p>Este módulo está sendo preparado e chega nas próximas versões do Kreato.</p>
      {children}
    </div>
  </div>
);
