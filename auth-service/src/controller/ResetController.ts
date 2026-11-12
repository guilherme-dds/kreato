import type { Request, Response } from "express";
import { MailtrapClient } from "mailtrap";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma.js";
import { BCRYPT_COST, MIN_PASSWORD_LENGTH } from "../utils/session.js";

/** Mesma resposta exista a conta ou não: o formulário não revela quais e-mails estão cadastrados */
const GENERIC_RESET_MESSAGE = "Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.";
const INVALID_TOKEN_MESSAGE = "Link de redefinição inválido, já usado ou expirado. Peça um novo.";
const INTERNAL_ERROR = "Erro interno. Tente novamente em instantes.";

const stripQuotes = (value: string | undefined) => (value || "").replace(/^["']|["']$/g, "").trim();

/** URL pública do frontend para o link do e-mail; em produção precisa estar configurada */
function frontendUrl(): string {
    const configured = stripQuotes(process.env.FRONTEND_URL).replace(/\/+$/, "");
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") {
        throw new Error("FRONTEND_URL não está configurada: defina a URL pública do frontend.");
    }
    return "http://localhost:5173";
}

/** Gera o token e envia o e-mail pelo Brevo (preferido) ou pelo Mailtrap */
async function sendResetEmail(user: { id: string; email: string; nome: string | null }): Promise<void> {
    const baseUrl = frontendUrl();
    const tokenRecord = await prisma.resetToken.create({
        data: {
            usuarioId: user.id,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });

    const resetLink = `${baseUrl}/reset-password?token=${tokenRecord.token}`;
    const subject = "Kreato - Redefinição de Senha";
    const textContent = `Clique no link a seguir para redefinir sua senha: ${resetLink}`;

    const brevoApiKey = stripQuotes(process.env.BREVO_API_KEY);
    if (brevoApiKey) {
        const senderEmail = stripQuotes(process.env.BREVO_SENDER_EMAIL);
        if (!senderEmail) {
            throw new Error("BREVO_SENDER_EMAIL não está configurado (remetente verificado no Brevo).");
        }

        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "api-key": brevoApiKey,
            },
            body: JSON.stringify({
                sender: { name: "Kreato", email: senderEmail },
                to: [{ email: user.email, name: user.nome || user.email }],
                subject,
                textContent,
                htmlContent: `<div style="font-family: sans-serif; padding: 20px;">
              <h2>Redefinição de Senha - Kreato</h2>
              <p>Olá, ${user.nome || "Usuário"}!</p>
              <p>Recebemos uma solicitação para redefinir sua senha. Clique no link abaixo para continuar:</p>
              <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #1b1a17; color: #f6f4ee; text-decoration: none; border-radius: 6px;">Redefinir Senha</a></p>
              <p>Ou copie e cole o seguinte link no seu navegador:</p>
              <p><a href="${resetLink}">${resetLink}</a></p>
              <p style="color: #6b675e; font-size: 13px;">Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>
            </div>`,
            }),
        });

        if (!brevoResponse.ok) {
            throw new Error(`Brevo API ${brevoResponse.status}: ${await brevoResponse.text()}`);
        }
        return;
    }

    const mailtrapToken = stripQuotes(process.env.MAILTRAP_TOKEN);
    if (!mailtrapToken) {
        throw new Error("Nenhum provedor de e-mail está configurado (BREVO_API_KEY ou MAILTRAP_TOKEN).");
    }

    const client = new MailtrapClient({ token: mailtrapToken });
    await client.send({
        from: { email: process.env.MAILTRAP_SENDER_EMAIL || "hello@demomailtrap.co", name: "Kreato" },
        to: [{ email: user.email, name: user.nome || user.email }],
        subject,
        text: textContent,
    });
}

export class ResetController {
    async reset(req: Request, res: Response) {
        try {
            const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
            if (!email) return res.status(400).json({ error: "Informe o e-mail." });

            const user = await prisma.usuario.findUnique({
                where: { email },
                select: { id: true, email: true, nome: true },
            });

            if (user) {
                // Envio em segundo plano: o tempo de resposta também não denuncia a conta
                sendResetEmail(user).catch((error) => {
                    console.error("Falha ao enviar e-mail de redefinição:", error);
                });
            }

            return res.json({ message: GENERIC_RESET_MESSAGE });
        } catch (error) {
            console.error("Error in reset password controller:", error);
            return res.status(500).json({ error: INTERNAL_ERROR });
        }
    }

    async confirm(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body || {};

            if (typeof token !== "string" || !token || typeof newPassword !== "string" || !newPassword) {
                return res.status(400).json({ error: "Token e nova senha são obrigatórios." });
            }

            if (newPassword.length < MIN_PASSWORD_LENGTH) {
                return res.status(400).json({ error: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
            }

            const record = await prisma.resetToken.findUnique({ where: { token }, select: { usuarioId: true } });
            if (!record) {
                return res.status(400).json({ error: INVALID_TOKEN_MESSAGE });
            }

            const senhaHash = await bcrypt.hash(newPassword, BCRYPT_COST);

            // Tudo ou nada: o token só é consumido uma vez (o updateMany condicional resolve corridas),
            // a senha muda e todas as sessões abertas e outros links pendentes deixam de valer.
            const changed = await prisma.$transaction(async (tx) => {
                const claimed = await tx.resetToken.updateMany({
                    where: { token, usado: false, expiresAt: { gt: new Date() } },
                    data: { usado: true },
                });
                if (claimed.count !== 1) return false;

                await tx.usuario.update({ where: { id: record.usuarioId }, data: { senhaHash } });
                await tx.refreshToken.deleteMany({ where: { usuarioId: record.usuarioId } });
                await tx.resetToken.updateMany({
                    where: { usuarioId: record.usuarioId, usado: false },
                    data: { usado: true },
                });
                return true;
            });

            if (!changed) {
                return res.status(400).json({ error: INVALID_TOKEN_MESSAGE });
            }

            return res.json({ message: "Senha alterada com sucesso! Entre novamente com a nova senha." });
        } catch (error) {
            console.error("Error in confirm password reset:", error);
            return res.status(500).json({ error: INTERNAL_ERROR });
        }
    }
}
