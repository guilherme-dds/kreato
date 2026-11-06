import express from "express";
import cors from "cors";
import "dotenv/config";
import swaggerUi from "swagger-ui-express";
import { Redis } from "ioredis";
import { AuthMiddleware, AdminMiddleware } from "./middlewares/auth.js";
import { logSwaggerDocument } from "./swagger.js";
import { buildStats, parseDays, periodStart } from "./stats.js";

const app = express();
app.use(express.json());
app.use(cors());

// Swagger UI Documentation for Log Service
app.use("/log/apidocs", swaggerUi.serve, swaggerUi.setup(logSwaggerDocument));
app.use("/log/apidocs", swaggerUi.serve, swaggerUi.setup(logSwaggerDocument));
app.use("/log/api-docs", swaggerUi.serve, swaggerUi.setup(logSwaggerDocument));
app.use("/log/docs", swaggerUi.serve, swaggerUi.setup(logSwaggerDocument));

// JSON Endpoint for raw OpenAPI spec
app.get("/log/openapi.json", (req, res) => {
  res.json(logSwaggerDocument);
});
app.get("/openapi.json", (req, res) => {
  res.json(logSwaggerDocument);
});

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = process.env.PORT || 3335;
const STREAM_KEY = "logs:stream";

export interface LogEntry {
  id: string;
  user_id: string;
  acao: string;
  timestamp: string;
  ip: string;
  entidade?: string;
  entidade_id?: string;
  detalhes?: Record<string, unknown> | string;
}

const memoryLogs: LogEntry[] = [];
const seenIds = new Set<string>();

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 1000, 5000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log(`[log-service] Conectado ao Redis em ${REDIS_URL}`);
});

redis.on("error", (err) => {
  console.error("[log-service] Erro no Redis:", err.message);
});

function parseStreamMessage(id: string, fields: string[]): LogEntry {
  const data: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const val = fields[i + 1];
    if (key && val !== undefined) {
      data[key] = val;
    }
  }

  const entry: LogEntry = {
    id,
    user_id: data.user_id || "anonymous",
    acao: data.acao || "UNKNOWN",
    timestamp: data.timestamp || new Date().toISOString(),
    ip: data.ip || "unknown",
  };

  if (data.entidade) entry.entidade = data.entidade;
  if (data.entidade_id) entry.entidade_id = data.entidade_id;
  if (data.detalhes) entry.detalhes = parseDetails(data.detalhes);

  return entry;
}

function parseDetails(raw: string): Record<string, unknown> | string {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : raw;
  } catch {
    return raw;
  }
}

async function startStreamConsumer() {
  let lastId = "0-0";

  while (true) {
    try {
      // Blocking read from Redis Stream
      const result = await redis.xread("BLOCK", 2000, "STREAMS", STREAM_KEY, lastId) as [string, [string, string[]][]][] | null;

      if (result) {
        for (const [streamName, messages] of result) {
          for (const [id, fields] of messages) {
            lastId = id;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              const logEntry = parseStreamMessage(id, fields);
              memoryLogs.push(logEntry);
              const entity = logEntry.entidade ? ` | entidade=${logEntry.entidade}#${logEntry.entidade_id ?? "-"}` : "";
              console.log(`[LOG-SERVICE XADD RECORD] id=${id} | user_id=${logEntry.user_id} | acao=${logEntry.acao}${entity} | ip=${logEntry.ip} | timestamp=${logEntry.timestamp}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[log-service] Erro ao consumir Redis Stream:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

app.get("/health", async (req, res) => {
  res.json({ status: "ok", redisStatus: redis.status, totalLogs: memoryLogs.length });
});

app.get("/logs", AuthMiddleware, AdminMiddleware, async (req, res) => {
  try {
    const rawStream = await redis.xrange(STREAM_KEY, "-", "+");
    const streamLogs: LogEntry[] = rawStream.map(([id, fields]) => parseStreamMessage(id, fields as string[]));

    res.json({
      count: streamLogs.length,
      logs: streamLogs.length > 0 ? streamLogs : memoryLogs,
    });
  } catch (err: any) {
    res.json({ count: memoryLogs.length, logs: memoryLogs });
  }
});

app.get("/api/logs", AuthMiddleware, AdminMiddleware, async (req, res) => {
  try {
    const rawStream = await redis.xrange(STREAM_KEY, "-", "+");
    const streamLogs: LogEntry[] = rawStream.map(([id, fields]) => parseStreamMessage(id, fields as string[]));

    res.json({
      count: streamLogs.length,
      logs: streamLogs.length > 0 ? streamLogs : memoryLogs,
    });
  } catch (err: any) {
    res.json({ count: memoryLogs.length, logs: memoryLogs });
  }
});

/**
 * GET /logs/stats?dias=30 — agregados do período para o painel administrativo.
 * Lê só a faixa do período no stream (os IDs do Redis começam com o timestamp em ms).
 */
async function statsHandler(req: express.Request, res: express.Response) {
  const days = parseDays(req.query.dias);
  const now = new Date();
  const start = periodStart(days, now);

  let entries: LogEntry[];
  try {
    const rawStream = await redis.xrange(STREAM_KEY, String(start.getTime()), "+");
    entries = rawStream.map(([id, fields]) => parseStreamMessage(id, fields as string[]));
    if (entries.length === 0 && memoryLogs.length > 0) entries = memoryLogs;
  } catch {
    // Redis fora do ar: usa o que o consumidor já guardou em memória
    entries = memoryLogs;
  }

  res.json({ ...buildStats(entries, days, now), fonte: redis.status === "ready" ? "redis" : "memoria" });
}

app.get("/logs/stats", AuthMiddleware, AdminMiddleware, statsHandler);
app.get("/api/logs/stats", AuthMiddleware, AdminMiddleware, statsHandler);

app.listen(PORT, () => {
  console.log(`[log-service] Rodando na porta ${PORT}`);
  startStreamConsumer().catch((err) => console.error("Consumer loop failed:", err));
});
