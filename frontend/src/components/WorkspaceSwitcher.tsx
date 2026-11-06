import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import type { WorkspaceSummary } from "../types";
import { ROLE_LABELS } from "../utils/team";

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  active: WorkspaceSummary | null;
  onSelect: (workspace: WorkspaceSummary) => void;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "K";

/** Mostra o workspace atual e, quando a pessoa participa de mais de um, permite trocar */
export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ workspaces, active, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canSwitch = workspaces.length > 1;

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  if (!active) {
    return <div className="workspace-switcher is-loading" aria-hidden="true" />;
  }

  return (
    <div className="workspace-switcher" ref={rootRef}>
      <button
        className="workspace-current"
        onClick={() => canSwitch && setIsOpen((open) => !open)}
        aria-haspopup={canSwitch ? "listbox" : undefined}
        aria-expanded={canSwitch ? isOpen : undefined}
        disabled={!canSwitch}
        title={canSwitch ? "Trocar de workspace" : undefined}
      >
        <span className="workspace-avatar">{initial(active.nome)}</span>
        <span className="workspace-text">
          <span className="workspace-name">{active.nome}</span>
          <span className="workspace-meta">
            {active.pessoal ? "Pessoal" : ROLE_LABELS[active.papel]}
            {active.totalMembros > 1 && ` · ${active.totalMembros} membros`}
          </span>
        </span>
        {canSwitch && <ChevronsUpDown size={15} className="workspace-chevron" />}
      </button>

      {isOpen && (
        <ul className="workspace-menu" role="listbox" aria-label="Workspaces">
          {workspaces.map((workspace) => {
            const isActive = workspace.id === active.id;
            return (
              <li key={workspace.id}>
                <button
                  role="option"
                  aria-selected={isActive}
                  className={`workspace-option ${isActive ? "is-active" : ""}`}
                  onClick={() => {
                    setIsOpen(false);
                    if (!isActive) onSelect(workspace);
                  }}
                >
                  <span className="workspace-avatar sm">{initial(workspace.nome)}</span>
                  <span className="workspace-text">
                    <span className="workspace-name">{workspace.nome}</span>
                    <span className="workspace-meta">
                      {workspace.pessoal ? "Pessoal" : ROLE_LABELS[workspace.papel]}
                      {workspace.totalMembros > 1 && (
                        <>
                          {" · "}
                          <Users size={11} /> {workspace.totalMembros}
                        </>
                      )}
                    </span>
                  </span>
                  {isActive && <Check size={15} className="workspace-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
