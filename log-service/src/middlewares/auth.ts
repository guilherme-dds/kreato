import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export async function AuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({ error: "Token not provided" });
  }

  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token invalid" });
  }

  // Com o segredo compartilhado, a verificação é local: um token inválido ou vencido
  // recebe 401 na hora, sem ida ao auth-service (o frontend então renova a sessão).
  const JWT_SECRET = process.env.JWT_SECRET;
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (typeof decoded !== "string" && typeof decoded.id === "string") {
        req.userId = decoded.id;
        if (decoded.role) {
          req.userRole = decoded.role;
        }
        return next();
      }
    } catch {
      // assinatura inválida ou token vencido
    }
    return res.status(401).json({ error: "Token invalid" });
  }

  // Sem JWT_SECRET neste serviço: delega a verificação ao auth-service
  const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://auth-service:3334";

  try {
    const response = await fetch(`${authServiceUrl}/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3000),
    });

    const data = (await response.json()) as { valid?: boolean; userId?: string; role?: string; error?: string };

    if (response.ok && data.valid && typeof data.userId === "string") {
      req.userId = data.userId;
      if (data.role) {
        req.userRole = data.role;
      }
      return next();
    }

    return res.status(401).json({ error: "Token invalid" });
  } catch (error) {
    console.error("Error verifying token with auth-service:", error);
    return res.status(401).json({ error: "Token invalid" });
  }
}

/** Papel atual no banco via auth-service; null = sem papel/token inválido, undefined = serviço fora */
async function currentRole(authorization: string | undefined): Promise<string | null | undefined> {
  const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://auth-service:3334";
  try {
    const response = await fetch(`${authServiceUrl}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization || "" },
      body: "{}",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401) return null;
    if (!response.ok) return undefined;
    const data = (await response.json()) as { valid?: boolean; role?: string };
    return data.valid && typeof data.role === "string" ? data.role : null;
  } catch {
    return undefined;
  }
}

export async function AdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Sem banco neste serviço: o auth-service confirma o papel atual (lido do banco)
  const role = await currentRole(req.headers.authorization);
  if (role === undefined) {
    return res.status(503).json({ error: "Não foi possível confirmar a permissão. Tente novamente." });
  }
  if (role?.toLowerCase() !== "admin") {
    return res.status(403).json({ error: "Acesso restrito para administradores." });
  }

  return next();
}
