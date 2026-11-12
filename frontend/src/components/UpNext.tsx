import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getContentsApi } from "../api/backend";
import { isSameDay, slateDay, slateTime } from "../utils/dates";
import type { Content } from "../types";

const MAX_ITEMS = 3;

interface UpNextProps {
  token: string | null;
  /** Muda quando o workspace ou a página mudam, para a lista refletir agendamentos recentes */
  refreshKey: string;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: Content[] };

/** "Próximas no ar": as próximas publicações agendadas do workspace, como uma ordem do dia de estúdio */
export const UpNext: React.FC<UpNextProps> = ({ token, refreshKey }) => {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    getContentsApi({ etapa: "AGENDADO", de: startOfToday.toISOString() }, token)
      .then((data) => {
        if (cancelled) return;
        const items = data.conteudos
          .filter((content) => content.dataPublicacao)
          .sort((a, b) => (a.dataPublicacao ?? "").localeCompare(b.dataPublicacao ?? ""))
          .slice(0, MAX_ITEMS);
        setState({ status: "ready", items });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const now = new Date();

  return (
    <section className="up-next" aria-labelledby="up-next-label">
      <h2 id="up-next-label" className="sidebar-label">
        Próximas no ar
      </h2>

      {state.status === "loading" && (
        <div className="up-next-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      )}

      {state.status === "error" && <p className="up-next-empty">Agenda indisponível agora.</p>}

      {state.status === "ready" && state.items.length === 0 && (
        <p className="up-next-empty">
          Nada agendado. <NavLink to="/calendario">Planejar no calendário</NavLink>
        </p>
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <ol className="up-next-list">
          {state.items.map((content) => {
            const date = new Date(content.dataPublicacao as string);
            const isToday = isSameDay(date, now);
            return (
              <li key={content.id}>
                <NavLink to={`/pipeline/${content.id}`} className={`up-next-item ${isToday ? "is-today" : ""}`}>
                  <time className="up-next-when" dateTime={content.dataPublicacao as string}>
                    {isToday ? (
                      <>
                        <span className="rec-dot" aria-hidden="true" />
                        HOJE
                      </>
                    ) : (
                      slateDay(date)
                    )}
                    <span className="up-next-time">{slateTime(date)}</span>
                  </time>
                  <span className="up-next-title">{content.titulo}</span>
                </NavLink>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
