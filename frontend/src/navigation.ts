import { House, Lightbulb, SquareKanban, CalendarDays, ChartColumn, Users, type LucideIcon } from "lucide-react";
import type { Plan } from "./types";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  requiredPlan?: Plan;
}

export const MAIN_NAV: NavItem[] = [
  {
    path: "/",
    label: "Início",
    icon: House,
    description: "Visão geral da sua produção de conteúdo.",
  },
  {
    path: "/ideias",
    label: "Ideias",
    icon: Lightbulb,
    description: "Registre temas, ganchos e legendas e organize suas ideias em um só lugar.",
  },
  {
    path: "/pipeline",
    label: "Pipeline",
    icon: SquareKanban,
    description: "Acompanhe cada conteúdo da ideia à publicação, etapa por etapa.",
  },
  {
    path: "/calendario",
    label: "Calendário",
    icon: CalendarDays,
    description: "Planeje suas publicações e mantenha uma frequência consistente.",
  },
  {
    path: "/metricas",
    label: "Métricas",
    icon: ChartColumn,
    description: "Registre resultados e compare o desempenho dos seus conteúdos.",
  },
  {
    path: "/equipe",
    label: "Equipe",
    icon: Users,
    description: "Convide sua equipe e defina permissões para roteiristas, editores e gestores.",
    requiredPlan: "STUDIO",
  },
];
