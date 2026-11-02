import type { Request, Response } from "express";
import { MailtrapClient } from "mailtrap";
import { hash } from "bcryptjs";
import prisma from "../utils/prisma.js";

export class ResetController {
    async reset(req: Request, res: Response) {
        try {
            const { email } = req.body || {};
            if (!email) return res.status(400).json({ error: "Email is required" });

            const user = await prisma.usuario.findUnique({ where: { email } });
            if (!user) return res.status(404).json({ error: "User not found" });

            const tokenRecord = await prisma.resetToken.create({
                data: {
                    usuarioId: user.id,
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            });

            const frontendUrl =
                process.env.FRONTEND_URL || "https://guilherme-santos-isw055.lapps.studio";
            const resetLink = `${frontendUrl}/reset-password?token=${tokenRecord.token}`;

            const rawBrevoKey = process.env.BREVO_API_KEY || "";
            const brevoApiKey = rawBrevoKey.replace(/^["']|["']$/g, "").trim();

            if (brevoApiKey) {
                const senderEmail =
                    process.env.BREVO_SENDER_EMAIL || "guilherme.dds.dev@gmail.com";

                const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "content-type": "application/json",
                        "api-key": brevoApiKey,
                    },
                    body: JSON.stringify({
                        sender: {
                            name: "Kreato",
                            email: senderEmail.trim(),
                        },
                        to: [
                            {
                                email: user.email,
                                name: user.nome || user.email,
                            },
                        ],
                        subject: "Kreato - Redefinição de Senha",
                        textContent: `Clique no link a seguir para redefinir sua senha: ${resetLink}`,
                        htmlContent: `<div style="font-family: sans-serif; padding: 20px;">
              <h2>Redefinição de Senha - Kreato</h2>
              <p>Olá, ${user.nome || "Usuário"}!</p>
              <p>Recebemos uma solicitação para redefinir sua senha. Clique no link abaixo para continuar:</p>
              <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #e50914; color: #fff; text-decoration: none; border-radius: 5px;">Redefinir Senha</a></p>
              <p>Ou copie e cole o seguinte link no seu navegador:</p>
              <p><a href="${resetLink}">${resetLink}</a></p>
            </div>`,
                    }),
                });

                if (!brevoResponse.ok) {
                    const errData = await brevoResponse.text();
                    console.error("Brevo API error:", brevoResponse.status, errData);
                    return res.status(500).json({
                        error: `Erro ao enviar e-mail via Brevo API (${brevoResponse.status}): ${errData}`
                    });
                }

                return res.json({ message: "Password reset email sent via Brevo" });
            }

            const rawMailtrapToken = process.env.MAILTRAP_TOKEN || "";
            const TOKEN_API = rawMailtrapToken.replace(/^["']|["']$/g, "").trim();

            if (!TOKEN_API) {
                console.warn("Nem BREVO_API_KEY nem MAILTRAP_TOKEN foram configurados.");
                return res.status(500).json({ error: "Nenhum provedor de e-mail está configurado (Brevo ou Mailtrap)." });
            }

            const client = new MailtrapClient({ token: TOKEN_API });

            const senderEmail = process.env.MAILTRAP_SENDER_EMAIL || "hello@demomailtrap.co";

            const sender = {
                email: senderEmail,
                name: "Kreato",
            };

            const recipients = [
                {
                    email: user.email,
                    name: user.nome || user.email,
                },
            ];

            await client.send({
                from: sender,
                to: recipients,
                subject: "Kreato - Redefinição de Senha",
                text: `Clique no link a seguir para redefinir sua senha: ${resetLink}`,
            });

            return res.json({ message: "Password reset email sent via Mailtrap" });
        } catch (error: any) {
            console.error("Error in reset password controller:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    async confirm(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body || {};

            if (!token || !newPassword) {
                return res.status(400).json({ error: "Token e nova senha são obrigatórios." });
            }

            const resetTokenRecord = await prisma.resetToken.findUnique({
                where: { token },
                include: { usuario: true },
            });

            if (!resetTokenRecord) {
                return res.status(404).json({ error: "Token de redefinição inválido ou não encontrado." });
            }

            if (resetTokenRecord.usado) {
                return res.status(400).json({ error: "Este token de redefinição já foi utilizado." });
            }

            if (resetTokenRecord.expiresAt < new Date()) {
                return res.status(400).json({ error: "Este token de redefinição expirou." });
            }

            const senhaHash = await hash(newPassword, 8);

            await prisma.usuario.update({
                where: { id: resetTokenRecord.usuarioId },
                data: { senhaHash },
            });

            await prisma.resetToken.update({
                where: { token },
                data: { usado: true },
            });

            return res.json({ message: "Senha alterada com sucesso!" });
        } catch (error: any) {
            console.error("Error in confirm password reset:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
}