import React, { useState, useEffect, useRef } from "react";
import {
  User as UserIcon,
  Edit3,
  Check,
  X,
  Loader2,
  Camera,
  Trash2,
  Crown,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { PremiumBadge } from "./PremiumBadge";
import { PLAN_LABELS, getUserPlan, isPaidPlan } from "../utils/plans";
import {
  getUserProfileApi,
  updateUserProfileApi,
  uploadUserAvatarApi,
  removeUserAvatarApi,
} from "../api/backend";

export const ProfilePage: React.FC = () => {
  const { showToast, openPlansModal: openPremiumModal } = useLayoutContext();
  const { user, token, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState<string>(user?.bio || "");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [tempBio, setTempBio] = useState(user?.bio || "");
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

  // Sync profile data from database on mount
  useEffect(() => {
    let isMounted = true;
    if (token) {
      getUserProfileApi(token)
        .then((fetchedUser) => {
          if (isMounted && fetchedUser) {
            const bioText = fetchedUser.bio || "";
            setBio(bioText);
            setTempBio(bioText);
            updateUser({
              bio: bioText,
              fotoPerfil: fetchedUser.fotoPerfil,
              plano: fetchedUser.plano,
            });
          }
        })
        .catch((err) => {
          console.error("Erro ao carregar perfil:", err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [token, updateUser]);

  const handleSaveBio = async () => {
    if (!token) return;
    const trimmed = tempBio.trim();
    setIsSavingBio(true);
    try {
      const updatedUser = await updateUserProfileApi(token, trimmed);
      const newBio = updatedUser.bio || trimmed;
      setBio(newBio);
      setTempBio(newBio);
      updateUser({ bio: newBio });
      setIsEditingBio(false);
      showToast("success", "Bio atualizada com sucesso no banco de dados!");
    } catch (err: any) {
      console.error("Erro ao salvar bio:", err);
      showToast("error", err.message || "Erro ao salvar bio no banco de dados.");
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleCancelBio = () => {
    setTempBio(bio);
    setIsEditingBio(false);
  };

  const handleAvatarClick = () => {
    if (fileInputRef.current && !isUploadingAvatar && !isRemovingAvatar) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = "";

    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const isImage =
      allowedMimeTypes.includes(file.type.toLowerCase()) || file.type.startsWith("image/");
    if (!isImage) {
      showToast(
        "error",
        "Formato de arquivo inválido! Por favor envie um arquivo de imagem (JPG, PNG, WEBP, GIF)."
      );
      return;
    }

    const MAX_SIZE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
      showToast(
        "error",
        `A imagem selecionada é muito grande (${sizeInMb}MB)! O tamanho máximo permitido é 5MB.`
      );
      return;
    }

    if (!token) {
      showToast("error", "Você precisa estar autenticado para enviar uma foto de perfil.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const updatedUser = await uploadUserAvatarApi(file, token);
      updateUser({ fotoPerfil: updatedUser.fotoPerfil });
      showToast("success", "Foto de perfil salva com sucesso!");
    } catch (err: any) {
      console.error("Erro no upload da foto de perfil:", err);
      showToast("error", err.message || "Erro ao fazer upload da foto de perfil.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!token) return;
    setIsRemovingAvatar(true);
    try {
      await removeUserAvatarApi(token);
      updateUser({ fotoPerfil: null });
      showToast("success", "Foto de perfil removida com sucesso!");
    } catch (err: any) {
      console.error("Erro ao remover foto de perfil:", err);
      showToast("error", err.message || "Erro ao remover foto de perfil.");
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  const userName = user?.nome || (user?.email ? user.email.split("@")[0] : "Usuário");
  const plan = getUserPlan(user);
  const isPaid = isPaidPlan(user);

  return (
    <div className="profile-page-container">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
      />

      {/* Profile Header */}
      <div className="profile-card">
        <div className="profile-avatar-wrapper">
          <div
            className={`profile-avatar-circle ${isUploadingAvatar ? "uploading" : ""}`}
            onClick={handleAvatarClick}
            title="Clique para alterar a foto de perfil"
          >
            {isUploadingAvatar ? (
              <Loader2 size={36} className="spinning-icon avatar-spinner" />
            ) : user?.fotoPerfil ? (
              <img src={user.fotoPerfil} alt={userName} className="profile-avatar-img" />
            ) : (
              <UserIcon size={44} />
            )}

            <div className="avatar-hover-overlay">
              <Camera size={22} />
              <span>Alterar</span>
            </div>
          </div>

          <div className="avatar-action-buttons">
            <button
              className="avatar-action-btn upload-btn"
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar || isRemovingAvatar}
            >
              <Camera size={14} />
              <span>{user?.fotoPerfil ? "Trocar Foto" : "Enviar Foto"}</span>
            </button>

            {user?.fotoPerfil && (
              <button
                className="avatar-action-btn remove-btn"
                onClick={handleRemoveAvatar}
                disabled={isUploadingAvatar || isRemovingAvatar}
              >
                {isRemovingAvatar ? (
                  <Loader2 size={14} className="spinning-icon" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>Remover</span>
              </button>
            )}
          </div>
          <span className="avatar-hint-text">Formatos: JPG, PNG, WEBP, GIF (máx. 5MB)</span>
        </div>

        <div className="profile-info-section">
          {/* User Name & Plan Badge */}
          <div className="profile-title-row">
            <h1 className="profile-name">{userName}</h1>
            {isPaid ? (
              <PremiumBadge plan={plan} size="md" />
            ) : (
              <span className="plan-chip free-chip">Plano Gratuito</span>
            )}
          </div>
          <span className="profile-email-sub">{user?.email}</span>

          {/* Plan Status Banner */}
          <div className="profile-plan-status-card">
            {isPaid ? (
              <div className="plan-status-content premium">
                <div>
                  <h4><Crown size={16} className="gold-text" /> Você é assinante do {PLAN_LABELS[plan]}</h4>
                  <p>Todos os recursos de organização desbloqueados.</p>
                </div>
                {openPremiumModal && (
                  <button className="btn btn-sm btn-manage-plan" onClick={openPremiumModal}>
                    Gerenciar Assinatura
                  </button>
                )}
              </div>
            ) : (
              <div className="plan-status-content free">
                <div>
                  <h4>Plano Gratuito Ativo</h4>
                  <p>Funcionalidades básicas com limites de uso.</p>
                </div>
                {openPremiumModal && (
                  <button className="btn btn-sm btn-upgrade-gold" onClick={openPremiumModal}>
                    <Sparkles size={14} /> Assinar Kreato Creator (R$ 19,90/mês)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Short Bio */}
          <div className="profile-bio-container">
            {isEditingBio ? (
              <div className="bio-edit-wrapper">
                <textarea
                  className="bio-textarea"
                  value={tempBio}
                  onChange={(e) => setTempBio(e.target.value)}
                  placeholder="Escreva uma bio curta..."
                  maxLength={250}
                  rows={2}
                  disabled={isSavingBio}
                />
                <div className="bio-edit-actions">
                  <span className="bio-char-count">{tempBio.length}/250</span>
                  <div className="bio-btn-group">
                    <button
                      className="bio-btn cancel"
                      onClick={handleCancelBio}
                      disabled={isSavingBio}
                    >
                      <X size={14} /> Cancelar
                    </button>
                    <button
                      className="bio-btn save"
                      onClick={handleSaveBio}
                      disabled={isSavingBio}
                    >
                      {isSavingBio ? (
                        <Loader2 size={14} className="spinning-icon" />
                      ) : (
                        <Check size={14} />
                      )}{" "}
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bio-display-wrapper">
                <p className="profile-bio-text">
                  {bio ? (
                    bio
                  ) : (
                    <span className="bio-placeholder">
                      Nenhuma bio cadastrada. Clique ao lado para adicionar.
                    </span>
                  )}
                </p>
                <button
                  className="bio-edit-trigger"
                  onClick={() => {
                    setTempBio(bio);
                    setIsEditingBio(true);
                  }}
                >
                  <Edit3 size={14} />
                  <span>Editar bio</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
