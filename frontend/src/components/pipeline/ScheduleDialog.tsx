import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fromDateTimeLocal, toDateTimeLocal } from "../../utils/content";

interface ScheduleDialogProps {
  title: string;
  onConfirm: (isoDate: string) => void;
  onCancel: () => void;
}

/** Sugestão padrão: amanhã às 18h, horário de pico comum nas redes */
function defaultScheduleValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
}

/** Pede a data de publicação ao mover um conteúdo para "Agendado" */
export const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ title, onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultScheduleValue);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const iso = fromDateTimeLocal(value);
    if (iso) onConfirm(iso);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card idea-modal schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
        <button className="modal-close-btn" onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </button>
        <div className="idea-modal-header">
          <p className="modal-kicker timecode">Agenda</p>
          <div>
            <h2 id="schedule-title">Agendar publicação</h2>
            <p className="schedule-dialog-subtitle">{title}</p>
          </div>
        </div>
        <form className="idea-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="schedule-date">Data e hora da publicação</label>
            <input
              id="schedule-date"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value}>
              Agendar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
