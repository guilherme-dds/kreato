export const logSwaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Kreato - Log Service API",
    version: "1.0.0",
    description:
      "Documentação completa do Microserviço de Logs & Auditoria (Log Service) da plataforma Kreato. Consome eventos de auditoria em tempo real via Redis Streams (XREAD / XADD) e fornece histórico de ações de usuários para administradores.",
    contact: {
      name: "Guilherme Santos",
      email: "guilherme.dds.dev@gmail.com",
    },
  },
  servers: [
    {
      url: "http://localhost:3335",
      description: "Servidor Direct Log Microservice (Porta 3335)",
    },
    {
      url: "http://localhost:8209",
      description: "Gateway de Produção via Nginx Reverse Proxy (Porta 8209)",
    },
  ],
  tags: [
    {
      name: "Logs & Auditoria",
      description: "Endpoints para consulta de logs de eventos e verificação de saúde do microserviço",
    },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Logs & Auditoria"],
        summary: "Verificar saúde do serviço de logs",
        description: "Retorna o status operacional do Log Service, estado da conexão com o Redis e o total de logs em memória.",
        responses: {
          "200": {
            description: "Serviço operacional",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  redisStatus: "ready",
                  totalLogs: 42,
                },
              },
            },
          },
        },
      },
    },
    "/api/logs": {
      get: {
        tags: ["Logs & Auditoria"],
        summary: "Consultar logs de auditoria (Apenas ADMIN)",
        description:
          "Retorna os registros de eventos capturados via Redis Stream (ou buffer de memória em caso de fallback). Requer autenticação JWT de um usuário com role ADMIN.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Logs de auditoria retornados com sucesso",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogsResponse" },
                example: {
                  count: 2,
                  logs: [
                    {
                      id: "1700000000000-0",
                      user_id: "cly1234567890abcdef",
                      acao: "LOGIN",
                      timestamp: "2026-09-28T14:00:00.000Z",
                      ip: "127.0.0.1",
                    },
                    {
                      id: "1700000005000-0",
                      user_id: "cly1234567890abcdef",
                      acao: "VERIFY_STRIPE_PAYMENT_SUCCESS",
                      timestamp: "2026-09-28T14:00:05.000Z",
                      ip: "127.0.0.1",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Token ausente ou inválido",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Token não fornecido ou inválido." },
              },
            },
          },
          "403": {
            description: "Acesso negado (Requer role ADMIN)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Acesso negado. Apenas administradores podem acessar os logs." },
              },
            },
          },
        },
      },
    },
    "/logs": {
      get: {
        tags: ["Logs & Auditoria"],
        summary: "Consultar logs de auditoria (Rota alternativa - Apenas ADMIN)",
        description: "Alias direto para a rota /api/logs.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Logs de auditoria retornados com sucesso",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogsResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Insira o token JWT no formato: Bearer <seu_token>",
      },
    },
    schemas: {
      LogEntry: {
        type: "object",
        properties: {
          id: { type: "string", example: "1700000000000-0" },
          user_id: { type: "string", example: "cly1234567890abcdef" },
          acao: { type: "string", example: "LOGIN" },
          timestamp: { type: "string", format: "date-time", example: "2026-09-28T14:00:00.000Z" },
          ip: { type: "string", example: "127.0.0.1" },
        },
      },
      LogsResponse: {
        type: "object",
        properties: {
          count: { type: "integer", example: 2 },
          logs: {
            type: "array",
            items: { $ref: "#/components/schemas/LogEntry" },
          },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          redisStatus: { type: "string", example: "ready" },
          totalLogs: { type: "integer", example: 42 },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Mensagem de erro detalhada" },
        },
      },
    },
  },
};
