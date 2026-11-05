import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Download, File, FileText, Film, Image, Music, Paperclip, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayoutContext } from "../../layouts/layoutContext";
import {
  deleteAttachmentApi,
  downloadAttachmentBlob,
  getAttachmentsApi,
  isPlanLimitError,
  uploadAttachmentApi,
} from "../../api/backend";
import type { Attachment, StorageUsage } from "../../types";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  canPreviewInBrowser,
  fileKind,
  formatBytes,
  type FileKind,
} from "../../utils/files";

// Miniaturas só para imagens pequenas, para não baixar arquivos pesados ao abrir o editor
const THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024;

const KIND_ICONS: Record<FileKind, React.FC<{ size?: number }>> = {
  image: Image,
  video: Film,
  audio: Music,
  pdf: FileText,
  document: File,
};

const AttachmentThumb: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const kind = fileKind(attachment.tipoMime);
  const showImage = kind === "image" && attachment.tamanhoBytes <= THUMBNAIL_MAX_BYTES;

  useEffect(() => {
    if (!showImage) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    downloadAttachmentBlob(attachment.id, token)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, showImage, token]);

  const Icon = KIND_ICONS[kind];
  return (
    <span className={`attachment-thumb kind-${kind}`}>
      {url ? <img src={url} alt="" /> : <Icon size={18} />}
    </span>
  );
};

interface AttachmentsPanelProps {
  contentId: number;
}

export const AttachmentsPanel: React.FC<AttachmentsPanelProps> = ({ contentId }) => {
  const { token, user } = useAuth();
  const { showToast, openPlansModal } = useLayoutContext();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ id: number; name: string }[]>([]);
  const uploadSeq = useRef(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAttachmentsApi(contentId, token);
      setAttachments(data.anexos);
      setUsage(data.uso);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar anexos");
    } finally {
      setIsLoading(false);
    }
  }, [contentId, token]);

  useEffect(() => {
    load();
  }, [load]);

  /** Envia os arquivos um por vez, validando tamanho e cota antes de gastar banda */
  const uploadFiles = async (files: File[]) => {
    let usedBytes = usage?.usadoBytes ?? 0;

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast("error", `"${file.name}" passa de ${formatBytes(MAX_ATTACHMENT_BYTES)} por arquivo.`);
        continue;
      }
      if (usage && usedBytes + file.size > usage.limiteBytes) {
        showToast("error", `Sem espaço para "${file.name}": o limite do seu plano é ${formatBytes(usage.limiteBytes)}.`);
        openPlansModal();
        break;
      }

      const uploadId = ++uploadSeq.current;
      setUploading((prev) => [...prev, { id: uploadId, name: file.name }]);
      try {
        const result = await uploadAttachmentApi(contentId, file, token);
        usedBytes = result.uso.usadoBytes;
        setAttachments((prev) => [result.anexo, ...prev]);
        setUsage(result.uso);
      } catch (err) {
        showToast("error", err instanceof Error ? err.message : `Erro ao enviar "${file.name}"`);
        if (isPlanLimitError(err)) {
          openPlansModal();
          break;
        }
      } finally {
        setUploading((prev) => prev.filter((item) => item.id !== uploadId));
      }
    }
  };

  const handleFiles = (list: FileList | null) => {
    if (list && list.length > 0) uploadFiles(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  };

  const openAttachment = async (attachment: Attachment, forceDownload = false) => {
    const preview = !forceDownload && canPreviewInBrowser(attachment.tipoMime);
    // A aba precisa ser aberta no clique; depois do await o navegador bloquearia o pop-up
    const previewWindow = preview ? window.open("", "_blank") : null;
    setBusyId(attachment.id);
    try {
      const blob = await downloadAttachmentBlob(attachment.id, token);
      const url = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.nomeOriginal;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      previewWindow?.close();
      showToast("error", err instanceof Error ? err.message : "Erro ao abrir anexo");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!window.confirm(`Excluir o anexo "${attachment.nomeOriginal}"?`)) return;
    setBusyId(attachment.id);
    try {
      await deleteAttachmentApi(attachment.id, token);
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      setUsage((prev) => (prev ? { ...prev, usadoBytes: Math.max(0, prev.usadoBytes - attachment.tamanhoBytes) } : prev));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao excluir anexo");
    } finally {
      setBusyId(null);
    }
  };

  const usagePercent = usage ? Math.min(100, Math.round((usage.usadoBytes / usage.limiteBytes) * 100)) : 0;

  return (
    <div className="editor-panel attachments-panel">
      <h3>
        <Paperclip size={13} /> Anexos {attachments.length > 0 && `(${attachments.length})`}
      </h3>

      <button
        type="button"
        className={`attachment-dropzone ${isDragOver ? "is-drag-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={20} />
        <span>
          <strong>Arraste arquivos</strong> ou clique para enviar
        </span>
        <small>Vídeos brutos, thumbnails, áudios, PDFs · até {formatBytes(MAX_ATTACHMENT_BYTES)} cada</small>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading.map(({ id, name }) => (
        <div key={id} className="attachment-item is-uploading">
          <span className="attachment-thumb">
            <RefreshCw size={16} className="spinning-icon" />
          </span>
          <span className="attachment-info">
            <span className="attachment-name">{name}</span>
            <span className="attachment-meta">Enviando...</span>
          </span>
        </div>
      ))}

      {isLoading ? (
        <p className="calendar-panel-empty">Carregando anexos...</p>
      ) : error ? (
        <p className="calendar-panel-empty">
          {error}{" "}
          <button className="attachment-retry" onClick={load}>
            Tentar novamente
          </button>
        </p>
      ) : (
        attachments.map((attachment) => (
          <div key={attachment.id} className={`attachment-item ${busyId === attachment.id ? "is-busy" : ""}`}>
            <AttachmentThumb attachment={attachment} />
            <button
              className="attachment-info"
              onClick={() => openAttachment(attachment)}
              title={canPreviewInBrowser(attachment.tipoMime) ? "Abrir em nova aba" : "Baixar"}
            >
              <span className="attachment-name">{attachment.nomeOriginal}</span>
              <span className="attachment-meta">
                {formatBytes(attachment.tamanhoBytes)}
                {attachment.autor && ` · ${attachment.autor.id === user?.id ? "você" : attachment.autor.nome.split(" ")[0]}`}
              </span>
            </button>
            <button
              className="idea-action"
              onClick={() => openAttachment(attachment, true)}
              disabled={busyId === attachment.id}
              title="Baixar"
              aria-label={`Baixar ${attachment.nomeOriginal}`}
            >
              <Download size={15} />
            </button>
            <button
              className="idea-action danger"
              onClick={() => handleDelete(attachment)}
              disabled={busyId === attachment.id}
              title="Excluir"
              aria-label={`Excluir ${attachment.nomeOriginal}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      )}

      {usage && (
        <div className={`attachment-storage ${usagePercent >= 90 ? "is-full" : usagePercent >= 75 ? "is-warning" : ""}`}>
          <div className="usage-bar-track">
            <div className="usage-bar-fill" style={{ width: `${usagePercent}%` }} />
          </div>
          <span>
            {formatBytes(usage.usadoBytes)} de {formatBytes(usage.limiteBytes)} usados no workspace
          </span>
          {usagePercent >= 75 && (
            <button className="usage-bar-upgrade" onClick={openPlansModal}>
              <Crown size={13} /> Mais espaço
            </button>
          )}
        </div>
      )}
    </div>
  );
};
