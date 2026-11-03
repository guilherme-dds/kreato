import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { MAIN_NAV } from "../navigation";

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const firstName = (user?.nome || user?.email?.split("@")[0] || "Criador").split(" ")[0];
  const modules = MAIN_NAV.filter((item) => item.path !== "/");

  return (
    <div className="page">
      <PageHeader
        icon={Sparkles}
        title={`Olá, ${firstName}!`}
        description="Tudo o que você precisa para planejar, organizar e acompanhar seus conteúdos em um só lugar."
      />

      <div className="module-grid">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path} className="module-card">
              <div className="module-card-icon">
                <Icon size={22} />
              </div>
              <div className="module-card-body">
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
              <ArrowRight size={18} className="module-card-arrow" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};
