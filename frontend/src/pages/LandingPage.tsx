import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KreatoLogo } from "../components/KreatoLogo";
import { getBillingPlansApi } from "../api/backend";
import type { Plan, PlanLimits } from "../types";
import "./landing.css";

/** Etapas do pipeline, na ordem do quadro, com quem age em cada uma */
const STAGES = [
  { name: "Ideia", text: "Guarde o gancho antes que ele fuja: plataforma, formato e tags.", who: "Qualquer pessoa da equipe" },
  { name: "Roteiro", text: "Escreva com contador de palavras e tempo de fala estimado.", who: "Roteirista" },
  { name: "Gravação", text: "O roteiro aprovado vira pauta de gravação, com os anexos à mão.", who: "Gestor aprova o roteiro" },
  { name: "Edição", text: "Brutos, trilhas e capas ficam presos ao conteúdo, não ao seu celular.", who: "Editor" },
  { name: "Agendado", text: "Data e hora no calendário; arraste o card para remarcar.", who: "Gestor" },
  { name: "Publicado", text: "Registre views, curtidas e salvamentos e compare por plataforma.", who: "Gestor" },
] as const;

/** Cards parados no quadro do hero: o quadro parece em uso */
const BOARD_CARDS: Record<number, string[]> = {
  0: ["Bastidores do set", "Unboxing do tripé"],
  1: ["Rotina de domingo"],
  2: [],
  3: ["Tutorial de luz"],
  4: ["Q&A ao vivo"],
  5: ["Primeiro vlog", "Setup de 2026"],
};

const FEATURES = [
  {
    title: "Revisão de roteiro",
    text: "O gestor comenta trecho por trecho, pede ajustes ou aprova. Só roteiro aprovado segue para a gravação.",
  },
  {
    title: "Banco de ideias",
    text: "Busca, filtros por status, plataforma e tag. Uma ideia vira conteúdo no quadro com um clique.",
  },
  {
    title: "Calendário editorial",
    text: "O mês inteiro de publicações numa grade. Mudou a data? Arraste o card para o novo dia.",
  },
  {
    title: "Anexos por conteúdo",
    text: "Vídeos brutos, áudios, imagens e PDFs guardados junto do roteiro que os usa.",
  },
  {
    title: "Métricas que você registra",
    text: "Views, curtidas, comentários, compartilhamentos e salvamentos, com taxa de engajamento por formato.",
  },
  {
    title: "Equipe com papéis",
    text: "Convide por e-mail. Roteirista, editor e gestor veem e movem só o que é da etapa deles.",
  },
];

interface PlanColumn {
  plano: Plan;
  nome: string;
  precoCentavos: number;
  limites: PlanLimits;
  cta: string;
}

// Mesmos valores do backend; o preço real vem de GET /api/stripe/plans quando disponível
const FALLBACK_PLANS: PlanColumn[] = [
  {
    plano: "FREE",
    nome: "Gratuito",
    precoCentavos: 0,
    limites: { ideias: 50, conteudosAtivos: 15, armazenamentoMB: 100, historicoMetricasDias: 30, membros: 1 },
    cta: "Começar grátis",
  },
  {
    plano: "CREATOR",
    nome: "Creator",
    precoCentavos: 2990,
    limites: { ideias: null, conteudosAtivos: null, armazenamentoMB: 2048, historicoMetricasDias: null, membros: 1 },
    cta: "Assinar o Creator",
  },
  {
    plano: "STUDIO",
    nome: "Studio",
    precoCentavos: 7990,
    limites: { ideias: null, conteudosAtivos: null, armazenamentoMB: 10240, historicoMetricasDias: null, membros: 5 },
    cta: "Assinar o Studio",
  },
];

const formatPrice = (cents: number) =>
  cents === 0 ? "R$ 0" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const formatStorage = (mb: number | null) =>
  mb === null ? "Sem limite" : mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR")} GB` : `${mb} MB`;
const formatCount = (value: number | null, unit = "") => (value === null ? "Sem limite" : `${value}${unit}`);

const PLAN_ROWS: { label: string; value: (l: PlanLimits) => string }[] = [
  { label: "Ideias guardadas", value: (l) => formatCount(l.ideias) },
  { label: "Conteúdos em produção", value: (l) => formatCount(l.conteudosAtivos) },
  { label: "Espaço para anexos", value: (l) => formatStorage(l.armazenamentoMB) },
  { label: "Histórico de métricas", value: (l) => (l.historicoMetricasDias === null ? "Completo" : `${l.historicoMetricasDias} dias`) },
  { label: "Pessoas no workspace", value: (l) => formatCount(l.membros) },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A claquete do hero: um conteúdo atravessa as seis etapas uma vez, ao abrir a página */
const SlateBoard: React.FC = () => {
  const last = STAGES.length - 1;
  const [step, setStep] = useState(() => (prefersReducedMotion() ? last : 0));

  useEffect(() => {
    if (step >= last) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 900 : 620);
    return () => window.clearTimeout(timer);
  }, [step, last]);

  const done = step >= last;

  return (
    <figure className="lp-slate" aria-label="Quadro de produção do Kreato com um conteúdo indo de Ideia até Publicado">
      <div className="lp-slate-clapper" aria-hidden="true" />
      <dl className="lp-slate-fields">
        <div>
          <dt>Produção</dt>
          <dd>Canal da Lu</dd>
        </div>
        <div>
          <dt>Cena</dt>
          <dd>12</dd>
        </div>
        <div>
          <dt>Take</dt>
          <dd>3</dd>
        </div>
        <div className="lp-slate-rec">
          <span className={`lp-slate-rec-dot ${done ? "is-off" : ""}`} aria-hidden="true" />
          <dd>{done ? "No ar" : "Gravando"}</dd>
        </div>
      </dl>

      <div className="lp-slate-board" style={{ "--step": step } as React.CSSProperties}>
        {STAGES.map((stage, index) => (
          <div key={stage.name} className={`lp-slate-col ${index <= step ? "is-reached" : ""}`}>
            <span className="lp-slate-col-name">{stage.name}</span>
            <div className="lp-slate-col-cards" aria-hidden="true">
              {BOARD_CARDS[index]?.map((title) => (
                <span key={title} className="lp-slate-ghost">
                  {title}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className={`lp-slate-card ${done ? "is-done" : ""}`} aria-live="polite">
          <span className="lp-slate-card-title">3 erros ao gravar com o celular</span>
          <span className="lp-slate-card-meta">{done ? "12,4 mil views" : `Em ${STAGES[step]?.name.toLowerCase()}`}</span>
        </div>
      </div>
    </figure>
  );
};

export const LandingPage: React.FC = () => {
  const [plans, setPlans] = useState<PlanColumn[]>(FALLBACK_PLANS);

  // Preços reais do Stripe (catálogo público); sem resposta, ficam os valores de tabela
  useEffect(() => {
    let cancelled = false;
    getBillingPlansApi(null)
      .then((data) => {
        if (cancelled) return;
        setPlans((current) =>
          current.map((column) => {
            const offer = data.planos.find((p) => p.plano === column.plano);
            return offer ? { ...column, precoCentavos: offer.precoCentavos, limites: offer.limites } : column;
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const signUp = { pathname: "/login" };
  const signUpState = { cadastro: true };

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="Kreato, página inicial">
          <KreatoLogo size={32} />
          <span>Kreato</span>
        </Link>
        <nav aria-label="Seções">
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <Link to="/login" className="landing-nav-login">
            Entrar
          </Link>
          <Link to={signUp} state={signUpState} className="landing-btn landing-btn-ink">
            Criar conta grátis
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1>Seus vídeos, da ideia ao ar, num quadro só.</h1>
            <p className="landing-lede">
              O Kreato organiza a produção de conteúdo curto: guarda as ideias, acompanha roteiro, gravação e edição e
              agenda a publicação. Sozinho ou com a sua equipe.
            </p>
            <div className="landing-actions">
              <Link to={signUp} state={signUpState} className="landing-btn landing-btn-ink">
                Criar conta grátis
              </Link>
              <a href="#como-funciona" className="landing-btn landing-btn-line">
                Ver como funciona
              </a>
            </div>
            <p className="landing-fineprint">Plano gratuito sem cartão: 50 ideias e 15 conteúdos em produção.</p>
          </div>
          <SlateBoard />
        </section>

        <section className="landing-section" id="como-funciona" aria-labelledby="como-funciona-title">
          <h2 id="como-funciona-title">Seis etapas, cada uma com dono.</h2>
          <p className="landing-section-lede">
            Todo conteúdo passa pelas mesmas colunas. Você sabe o que está travado e quem precisa agir.
          </p>
          <ol className="landing-stages">
            {STAGES.map((stage) => (
              <li key={stage.name}>
                <h3>{stage.name}</h3>
                <p>{stage.text}</p>
                <span className="landing-stage-who">{stage.who}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-features" aria-labelledby="recursos-title">
          <h2 id="recursos-title">O que vem junto com o quadro.</h2>
          <ul className="landing-feature-list">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section" id="planos" aria-labelledby="planos-title">
          <h2 id="planos-title">Comece grátis. Assine quando o quadro encher.</h2>
          <p className="landing-section-lede">
            Cobrança mensal pelo Stripe. Troque de plano ou cancele quando quiser, direto na sua conta.
          </p>
          <div className="landing-plans-scroll">
            <table className="landing-plans">
              <caption className="sr-only">Comparação dos planos do Kreato</caption>
              <thead>
                <tr>
                  <td />
                  {plans.map((plan) => (
                    <th key={plan.plano} scope="col" className={plan.plano === "CREATOR" ? "is-featured" : undefined}>
                      <span className="landing-plan-name">{plan.nome}</span>
                      <span className="landing-plan-price">
                        {formatPrice(plan.precoCentavos)}
                        <small>/mês</small>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {plans.map((plan) => (
                      <td key={plan.plano} className={plan.plano === "CREATOR" ? "is-featured" : undefined}>
                        {row.value(plan.limites)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  {plans.map((plan) => (
                    <td key={plan.plano} className={plan.plano === "CREATOR" ? "is-featured" : undefined}>
                      <Link
                        to={signUp}
                        state={signUpState}
                        className={`landing-btn ${plan.plano === "CREATOR" ? "landing-btn-ink" : "landing-btn-line"}`}
                      >
                        {plan.cta}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="landing-closing" aria-labelledby="fechamento-title">
          <h2 id="fechamento-title">A próxima ideia já tem lugar para ir.</h2>
          <Link to={signUp} state={signUpState} className="landing-btn landing-btn-paper">
            Criar conta grátis
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand">
          <KreatoLogo size={24} />
          <span>Kreato</span>
        </div>
        <p>Planejamento de conteúdo para criadores e equipes pequenas.</p>
        <nav aria-label="Rodapé">
          <Link to="/login">Entrar</Link>
          <a href="#planos">Planos</a>
        </nav>
      </footer>
    </div>
  );
};
