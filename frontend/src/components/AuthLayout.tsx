import React from "react";
import { KreatoLogo } from "./KreatoLogo";
import { slateDate } from "../utils/dates";
import { CONTENT_STAGES, CONTENT_STAGE_LABELS } from "../utils/content";

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Texto curto que aparece no campo "Cena" da claquete */
  scene?: string;
}

/**
 * Moldura das telas fora do app (login, convite, redefinição de senha):
 * uma claquete em tinta ao lado do formulário em papel.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, scene = "Entrada" }) => (
  <div className="auth-screen">
    <aside className="auth-slate">
      <div className="auth-slate-stripes" aria-hidden="true" />
      <div className="auth-slate-brand">
        <KreatoLogo size={36} />
        <span>Kreato</span>
      </div>

      <div className="auth-slate-body">
        <p className="auth-slate-tagline">Da ideia ao ar, num só estúdio.</p>
        <p className="auth-slate-text">
          Ideias, roteiros, gravação, agenda e resultados de cada conteúdo, com a sua equipe no mesmo quadro.
        </p>
      </div>

      <dl className="auth-slate-fields">
        <div>
          <dt>Produção</dt>
          <dd>Kreato</dd>
        </div>
        <div>
          <dt>Cena</dt>
          <dd>{scene}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{slateDate(new Date())}</dd>
        </div>
      </dl>

      <ol className="auth-slate-stages" aria-label="Etapas de produção">
        {CONTENT_STAGES.map((stage, index) => (
          <li key={stage}>
            <span className="auth-slate-stage-number">{String(index + 1).padStart(2, "0")}</span>
            {CONTENT_STAGE_LABELS[stage]}
          </li>
        ))}
      </ol>
    </aside>

    <main className="auth-panel">
      <div className="auth-page-card">{children}</div>
    </main>
  </div>
);
