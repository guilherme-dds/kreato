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
                      entidade: "assinatura",
                      detalhes: { plano: "CREATOR" },
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
    "/api/logs/stats": {
      get: {
        tags: ["Logs & Auditoria"],
        summary: "Estatísticas de uso e segurança da plataforma (Apenas ADMIN)",
        description:
          "Agrega os eventos do período por dia (eventos, usuários ativos, logins, acessos negados), as ações mais frequentes e os eventos de segurança recentes. Também disponível em /logs/stats.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "dias",
            in: "query",
            required: false,
            description: "Tamanho do período em dias, terminando hoje (UTC). Entre 1 e 90; padrão 30.",
            schema: { type: "integer", minimum: 1, maximum: 90, default: 30 },
          },
        ],
        responses: {
          "200": {
            description: "Estatísticas do período",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogStats" },
              },
            },
          },
          "401": { description: "Token ausente ou inválido" },
          "403": { description: "Acesso negado (Requer role ADMIN)" },
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
          entidade: {
            type: "string",
            description: "Entidade de negócio afetada pelo evento (opcional)",
            example: "assinatura",
          },
          entidade_id: {
            type: "string",
            description: "Identificador da entidade afetada (opcional)",
            example: "42",
          },
          detalhes: {
            type: "object",
            additionalProperties: true,
            description: "Dados adicionais do evento em JSON (opcional)",
            example: { plano: "CREATOR" },
          },
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
      LogStats: {
        type: "object",
        properties: {
          periodo: {
            type: "object",
            properties: {
              dias: { type: "integer", example: 30 },
              inicio: { type: "string", format: "date-time" },
              fim: { type: "string", format: "date-time" },
            },
          },
          total: { type: "integer", example: 1280 },
          usuariosAtivos: { type: "integer", example: 57 },
          porDia: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dia: { type: "string", example: "2026-11-06" },
                eventos: { type: "integer", example: 42 },
                usuariosAtivos: { type: "integer", example: 12 },
                logins: { type: "integer", example: 9 },
                negados: { type: "integer", example: 1 },
              },
            },
          },
          porAcao: {
            type: "array",
            items: {
              type: "object",
              properties: { acao: { type: "string", example: "LOGIN" }, total: { type: "integer", example: 310 } },
            },
          },
          seguranca: {
            type: "object",
            properties: {
              acessosNegados: { type: "integer", example: 4 },
              erros: { type: "integer", example: 2 },
              limitesAtingidos: { type: "integer", example: 11 },
              recentes: { type: "array", items: { $ref: "#/components/schemas/LogEntry" } },
            },
          },
          fonte: { type: "string", enum: ["redis", "memoria"], example: "redis" },
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
