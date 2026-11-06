import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Copy, Crown, LogOut, Mail, RefreshCw, Send, Trash2, UserPlus, Users, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import {
  createInviteApi,
  getInvitesApi,
  getTeamApi,
  isPlanLimitError,
  leaveWorkspaceApi,
  removeMemberApi,
  resendInviteApi,
  revokeInviteApi,
  updateMemberRoleApi,
} from "../api/backend";
import type { AssignableRole, Invite, InviteDelivery, TeamMember, TeamResponse, WorkspaceRole } from "../types";
import { formatRelativeDate } from "../utils/content";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  assignableRolesFor,
  canManageMember,
} from "../utils/team";

const ROLE_ORDER: WorkspaceRole[] = ["DONO", "GESTOR", "ROTEIRISTA", "EDITOR"];

function expiryLabel(invite: Invite): string {
  if (invite.estado === "EXPIRADO") return "Expirado";
  const days = Math.ceil((new Date(invite.expiraEm).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? "Expira hoje" : `Expira em ${days} dias`;
}

const MemberAvatar: React.FC<{ member: TeamMember }> = ({ member }) =>
  member.usuario.fotoPerfil ? (
    <img src={member.usuario.fotoPerfil} alt="" className="team-avatar" />
  ) : (
    <span className="team-avatar">{(member.usuario.nome || member.usuario.email).charAt(0).toUpperCase()}</span>
  );

export const TeamPage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { showToast, openPlans, workspace, refreshWorkspaces } = useLayoutContext();

  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("EDITOR");
  const [isInviting, setIsInviting] = useState(false);
  const [lastDelivery, setLastDelivery] = useState<InviteDelivery | null>(null);
  const [copied, setCopied] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const teamData = await getTeamApi(token);
      setTeam(teamData);
      setInvites(teamData.podeGerenciar ? await getInvitesApi(token) : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar a equipe");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="catalog-loading">
        <RefreshCw className="spinning-icon" size={28} />
        <span>Carregando equipe...</span>
      </div>
    );
  }

  if (loadError || !team) {
    return (
      <div className="page">
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <Users size={28} />
          </div>
          <h3>Não foi possível carregar a equipe</h3>
          <p>{loadError}</p>
          <button className="btn btn-primary btn-sm ideas-empty-action" onClick={load}>
            <RefreshCw size={14} /> Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const { meuPapel, podeGerenciar, vagas } = team;
  const pendingInvites = invites.filter((i) => i.estado === "PENDENTE").length;
  const seatsUsed = vagas.membros + vagas.convitesPendentes;
  const isSoloPlan = vagas.limite !== null && vagas.limite <= 1;
  const seatsFull = vagas.limite !== null && seatsUsed >= vagas.limite;
  const assignable = assignableRolesFor(meuPapel);
  const inviteRole = assignable.includes(role) ? role : assignable[assignable.length - 1];
  const workspaceName = workspace?.nome ?? "este workspace";

  const sortedMembers = [...team.membros].sort(
    (a, b) => ROLE_ORDER.indexOf(a.papel) - ROLE_ORDER.indexOf(b.papel) || a.criadoEm.localeCompare(b.criadoEm)
  );

  const runBusy = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Algo deu errado");
    } finally {
      setBusyKey(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isInviting || !inviteRole) return;
    setIsInviting(true);
    setCopied(false);
    try {
      const delivery = await createInviteApi(trimmed, inviteRole, token);
      setLastDelivery(delivery);
      setInvites((prev) => [delivery.convite, ...prev]);
      setTeam((prev) => prev && { ...prev, vagas: { ...prev.vagas, convitesPendentes: prev.vagas.convitesPendentes + 1 } });
      setEmail("");
      showToast(
        delivery.emailEnviado ? "success" : "info",
        delivery.emailEnviado
          ? `Convite enviado para ${delivery.convite.email}.`
          : "Convite criado, mas o e-mail não foi enviado. Compartilhe o link abaixo."
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao enviar convite");
      // Só quem assina pode fazer upgrade
      if (isPlanLimitError(err) && meuPapel === "DONO") openPlans("membros");
    } finally {
      setIsInviting(false);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      showToast("info", "Não foi possível copiar automaticamente. Selecione o link e copie.");
    }
  };

  const changeRole = (member: TeamMember, papel: AssignableRole) =>
    runBusy(`member-${member.id}`, async () => {
      const updated = await updateMemberRoleApi(member.id, papel, token);
      setTeam((prev) =>
        prev && { ...prev, membros: prev.membros.map((m) => (m.id === member.id ? { ...m, papel: updated.papel } : m)) }
      );
      showToast("success", `${member.usuario.nome} agora é ${ROLE_LABELS[updated.papel].toLowerCase()}.`);
    });

  const removeMember = (member: TeamMember) => {
    if (!window.confirm(`Remover ${member.usuario.nome} de ${workspaceName}? A pessoa perde o acesso na hora.`)) return;
    runBusy(`member-${member.id}`, async () => {
      await removeMemberApi(member.id, token);
      setTeam(
        (prev) =>
          prev && {
            ...prev,
            membros: prev.membros.filter((m) => m.id !== member.id),
            vagas: { ...prev.vagas, membros: prev.vagas.membros - 1 },
          }
      );
      showToast("success", `${member.usuario.nome} foi removido(a) da equipe.`);
      refreshWorkspaces();
    });
  };

  const resendInvite = (invite: Invite) =>
    runBusy(`invite-${invite.id}`, async () => {
      const delivery = await resendInviteApi(invite.id, token);
      setLastDelivery(delivery);
      setCopied(false);
      setInvites((prev) => prev.map((i) => (i.id === invite.id ? delivery.convite : i)));
      // Um convite expirado volta a ocupar vaga
      if (invite.estado === "EXPIRADO") {
        setTeam((prev) => prev && { ...prev, vagas: { ...prev.vagas, convitesPendentes: prev.vagas.convitesPendentes + 1 } });
      }
      showToast(
        delivery.emailEnviado ? "success" : "info",
        delivery.emailEnviado ? `Convite reenviado para ${invite.email}.` : "Novo link gerado. Compartilhe-o com a pessoa."
      );
    });

  const revokeInvite = (invite: Invite) => {
    if (!window.confirm(`Cancelar o convite de ${invite.email}? O link deixa de funcionar.`)) return;
    runBusy(`invite-${invite.id}`, async () => {
      await revokeInviteApi(invite.id, token);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (lastDelivery?.convite.id === invite.id) setLastDelivery(null);
      if (invite.estado === "PENDENTE") {
        setTeam((prev) => prev && { ...prev, vagas: { ...prev.vagas, convitesPendentes: Math.max(0, prev.vagas.convitesPendentes - 1) } });
      }
      showToast("success", "Convite cancelado.");
    });
  };

  const leave = () => {
    if (!window.confirm(`Sair de ${workspaceName}? Você precisará de um novo convite para voltar.`)) return;
    runBusy("leave", async () => {
      await leaveWorkspaceApi(token);
      // Sem acesso ao workspace salvo, a lista volta para o pessoal
      await refreshWorkspaces();
      showToast("success", `Você saiu de ${workspaceName}.`);
      navigate("/");
    });
  };

  return (
    <div className="page page-wide team-page">
      <PageHeader
        icon={Users}
        title="Equipe"
        description={`Quem trabalha em ${workspaceName} e o que cada pessoa pode fazer no pipeline.`}
      />

      <div className="team-layout">
        <div className="team-main">
          <section className="team-card">
            <header className="team-card-header">
              <h2>Membros</h2>
              <span className="team-count">{team.membros.length}</span>
            </header>
            <ul className="team-list">
              {sortedMembers.map((member) => {
                const isMe = member.souEu === true;
                const canManage = !isMe && canManageMember(meuPapel, member.papel);
                const isBusy = busyKey === `member-${member.id}`;
                return (
                  <li key={member.id} className="team-row">
                    <MemberAvatar member={member} />
                    <div className="team-row-info">
                      <span className="team-row-name">
                        {member.usuario.nome}
                        {isMe && <span className="team-you">você</span>}
                      </span>
                      <span className="team-row-sub">
                        {member.usuario.email} · entrou {formatRelativeDate(member.criadoEm)}
                      </span>
                    </div>
                    <div className="team-row-actions">
                      {canManage ? (
                        <select
                          className="team-role-select"
                          value={member.papel}
                          onChange={(e) => changeRole(member, e.target.value as AssignableRole)}
                          disabled={isBusy}
                          aria-label={`Papel de ${member.usuario.nome}`}
                        >
                          {assignable.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`team-role-badge role-${member.papel.toLowerCase()}`}>
                          {member.papel === "DONO" && <Crown size={12} />}
                          {ROLE_LABELS[member.papel]}
                        </span>
                      )}
                      {canManage && (
                        <button
                          className="idea-action"
                          onClick={() => removeMember(member)}
                          disabled={isBusy}
                          title="Remover da equipe"
                          aria-label={`Remover ${member.usuario.nome}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {podeGerenciar && invites.length > 0 && (
            <section className="team-card">
              <header className="team-card-header">
                <h2>Convites</h2>
                <span className="team-count">{pendingInvites}</span>
              </header>
              <ul className="team-list">
                {invites.map((invite) => {
                  const isBusy = busyKey === `invite-${invite.id}`;
                  return (
                    <li key={invite.id} className={`team-row ${invite.estado === "EXPIRADO" ? "is-expired" : ""}`}>
                      <span className="team-avatar is-invite">
                        <Mail size={15} />
                      </span>
                      <div className="team-row-info">
                        <span className="team-row-name">{invite.email}</span>
                        <span className="team-row-sub">
                          {ROLE_LABELS[invite.papel]}
                          {invite.convidadoPor && ` · convidado por ${invite.convidadoPor.nome}`}
                          {" · "}
                          <span className={invite.estado === "EXPIRADO" ? "team-expired" : ""}>
                            <Clock size={11} /> {expiryLabel(invite)}
                          </span>
                        </span>
                      </div>
                      <div className="team-row-actions">
                        <button
                          className="idea-action"
                          onClick={() => resendInvite(invite)}
                          disabled={isBusy}
                          title={invite.estado === "EXPIRADO" ? "Renovar e reenviar" : "Reenviar e-mail"}
                          aria-label={`Reenviar convite para ${invite.email}`}
                        >
                          <Send size={15} />
                        </button>
                        <button
                          className="idea-action"
                          onClick={() => revokeInvite(invite)}
                          disabled={isBusy}
                          title="Cancelar convite"
                          aria-label={`Cancelar convite para ${invite.email}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {meuPapel !== "DONO" && (
            <button className="team-leave" onClick={leave} disabled={busyKey === "leave"}>
              <LogOut size={15} /> Sair de {workspaceName}
            </button>
          )}
        </div>

        <aside className="team-side">
          {podeGerenciar && (
            <section className="team-card">
              <header className="team-card-header">
                <h2>
                  <UserPlus size={15} /> Convidar
                </h2>
                {vagas.limite !== null && !isSoloPlan && (
                  <span className={`team-seats ${seatsFull ? "is-full" : ""}`}>
                    {seatsUsed}/{vagas.limite} vagas
                  </span>
                )}
              </header>

              {isSoloPlan ? (
                <div className="team-upsell">
                  <p>Trabalhar em equipe, com roteiristas, editores e gestores, é um recurso do plano Kreato Studio.</p>
                  {meuPapel === "DONO" ? (
                    <button className="btn btn-primary btn-sm" onClick={() => openPlans("membros")}>
                      <Crown size={15} /> Conhecer o Studio
                    </button>
                  ) : (
                    <p className="team-hint">Peça ao dono do workspace para assinar o Studio.</p>
                  )}
                </div>
              ) : (
                <form className="team-invite-form" onSubmit={handleInvite}>
                  <div className="form-group">
                    <label htmlFor="invite-email">E-mail</label>
                    <input
                      id="invite-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="pessoa@exemplo.com"
                      maxLength={150}
                      required
                      disabled={seatsFull}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="invite-role">Papel</label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => setRole(e.target.value as AssignableRole)}
                      disabled={seatsFull}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <small className="team-hint">{ROLE_DESCRIPTIONS[inviteRole]}</small>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={isInviting || seatsFull || !email.trim()}>
                    <Send size={15} /> {isInviting ? "Enviando..." : "Enviar convite"}
                  </button>
                  {seatsFull && (
                    <p className="team-hint">
                      Todas as vagas estão ocupadas (contando convites pendentes). Cancele um convite ou remova alguém.
                    </p>
                  )}
                </form>
              )}

              {lastDelivery && (
                <div className="team-link-box">
                  <span className="team-link-title">
                    {lastDelivery.emailEnviado ? (
                      <>
                        <Check size={14} /> E-mail enviado para {lastDelivery.convite.email}
                      </>
                    ) : (
                      <>O e-mail não foi enviado. Compartilhe o link com {lastDelivery.convite.email}:</>
                    )}
                  </span>
                  <div className="team-link-field">
                    <input readOnly value={lastDelivery.link} onFocus={(e) => e.target.select()} aria-label="Link do convite" />
                    <button
                      className="idea-action"
                      onClick={() => copyLink(lastDelivery.link)}
                      title="Copiar link"
                      aria-label="Copiar link do convite"
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <small className="team-hint">Vale por 7 dias e só funciona com a conta desse e-mail.</small>
                </div>
              )}
            </section>
          )}

          <section className="team-card">
            <header className="team-card-header">
              <h2>Papéis</h2>
            </header>
            <dl className="team-roles">
              {ROLE_ORDER.map((r) => (
                <div key={r} className={r === meuPapel ? "is-mine" : ""}>
                  <dt>
                    {ROLE_LABELS[r]}
                    {r === meuPapel && <span className="team-you">seu papel</span>}
                  </dt>
                  <dd>{ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
};
