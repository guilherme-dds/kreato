import { House, Lightbulb, SquareKanban, CalendarDays, ChartColumn, Users, type LucideIcon } from "lucide-react";
import type { Plan } from "./types";

export type NavGroup = "inicio" | "producao" | "resultados" | "estudio";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
  requiredPlan?: Plan;
}

/** Rótulos dos grupos da barra lateral (Início fica sozinho, sem rótulo) */
export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  inicio: null,
  producao: "Produção",
  resultados: "Resultados",
  estudio: "Estúdio",
};

export const MAIN_NAV: NavItem[] = [
  {
    path: "/",
    group: "inicio",
    label: "Início",
    icon: House,
    description: "Visão geral da sua produção de conteúdo.",
  },
  {
    path: "/ideias",
    group: "producao",
    label: "Ideias",
    icon: Lightbulb,
    description: "Registre temas, ganchos e legendas e organize suas ideias em um só lugar.",
  },
  {
    path: "/pipeline",
    group: "producao",
    label: "Pipeline",
    icon: SquareKanban,
    description: "Acompanhe cada conteúdo da ideia à publicação, etapa por etapa.",
  },
  {
    path: "/calendario",
    group: "producao",
    label: "Calendário",
    icon: CalendarDays,
    description: "Planeje suas publicações e mantenha uma frequência consistente.",
  },
  {
    path: "/metricas",
    group: "resultados",
    label: "Métricas",
    icon: ChartColumn,
    description: "Registre resultados e compare o desempenho dos seus conteúdos.",
  },
  {
    path: "/equipe",
    group: "estudio",
    label: "Equipe",
    icon: Users,
    description: "Convide sua equipe e defina permissões para roteiristas, editores e gestores.",
    requiredPlan: "STUDIO",
  },
];
