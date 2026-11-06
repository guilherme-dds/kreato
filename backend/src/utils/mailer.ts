/**
 * Envio de e-mails transacionais pelo backend, com os mesmos provedores do auth-service
 * (Brevo tem prioridade; depois Mailtrap). Usa a API HTTP de cada um, sem dependências extras.
 * Nunca lança erro: quem chama decide o que fazer quando o envio falha.
 */

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailResult {
  enviado: boolean;
  provedor?: "brevo" | "mailtrap";
  erro?: string;
}

function readSecret(name: string): string {
  return (process.env[name] || "").replace(/^["']|["']$/g, "").trim();
}

/** Escapa texto vindo do usuário (nome do workspace, nome de quem convidou) antes de ir para o HTML */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const recipient = { email: message.to, name: message.toName || message.to };

  try {
    const brevoKey = readSecret("BREVO_API_KEY");
    if (brevoKey) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
        body: JSON.stringify({
          sender: { name: "Kreato", email: readSecret("BREVO_SENDER_EMAIL") || "guilherme.dds.dev@gmail.com" },
          to: [recipient],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
      });
      if (!response.ok) return { enviado: false, provedor: "brevo", erro: `Brevo ${response.status}` };
      return { enviado: true, provedor: "brevo" };
    }

    const mailtrapToken = readSecret("MAILTRAP_TOKEN");
    if (mailtrapToken) {
      const response = await fetch("https://send.api.mailtrap.io/api/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${mailtrapToken}` },
        body: JSON.stringify({
          from: { email: readSecret("MAILTRAP_SENDER_EMAIL") || "hello@demomailtrap.co", name: "Kreato" },
          to: [recipient],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) return { enviado: false, provedor: "mailtrap", erro: `Mailtrap ${response.status}` };
      return { enviado: true, provedor: "mailtrap" };
    }

    return { enviado: false, erro: "Nenhum provedor de e-mail configurado (BREVO_API_KEY ou MAILTRAP_TOKEN)." };
  } catch (error: any) {
    return { enviado: false, erro: error?.message || "Falha de rede ao enviar e-mail." };
  }
}
