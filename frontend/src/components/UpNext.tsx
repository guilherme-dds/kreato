import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { CONTENTS_CHANGED_EVENT, getContentsApi } from "../api/backend";
import { isSameDay, slateDay, slateTime } from "../utils/dates";
import type { Content } from "../types";

const MAX_ITEMS = 3;

interface UpNextProps {
  token: string | null;
  /** Muda quando o workspace muda; edições de conteúdo e a volta para a aba também recarregam */
  refreshKey: string;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: Content[] };

/** "Próximas no ar": as próximas publicações agendadas do workspace, como uma ordem do dia de estúdio */
export const UpNext: React.FC<UpNextProps> = ({ token, refreshKey }) => {
  const [state, setState] = useState<State>({ status: "loading" });
  // O token renova a cada 15 min; a busca usa o mais novo sem refazer o efeito
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const requestId = useRef(0);

  const load = useCallback(() => {
    const current = ++requestId.current;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    getContentsApi({ etapa: "AGENDADO", de: startOfToday.toISOString() }, tokenRef.current)
      .then((data) => {
        if (current !== requestId.current) return;
        const items = data.conteudos
          .filter((content) => content.dataPublicacao)
          .sort((a, b) => (a.dataPublicacao ?? "").localeCompare(b.dataPublicacao ?? ""))
          .slice(0, MAX_ITEMS);
        setState({ status: "ready", items });
      })
      .catch(() => {
        if (current === requestId.current) setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Recarrega quando um conteúdo muda e quando a pessoa volta para a aba (agenda de outros membros)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(load, 400);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") debounced();
    };
    window.addEventListener(CONTENTS_CHANGED_EVENT, debounced);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener(CONTENTS_CHANGED_EVENT, debounced);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

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
