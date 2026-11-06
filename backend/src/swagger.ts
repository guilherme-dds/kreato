/**
 * Documentação OpenAPI 3.0 da API principal do Kreato (backend, porta 3333).
 * Servida em /api/docs (Swagger UI) e /api/openapi.json.
 * Cada rota também existe sem o prefixo /api (ex.: /conteudos), que é o caminho usado direto na porta 3333.
 */

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (items: Schema): Schema => ({ type: "array", items });
const obj = (properties: Record<string, Schema>, required?: string[]): Schema => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
});
const str = (description?: string, example?: unknown): Schema => ({
  type: "string",
  ...(description ? { description } : {}),
  ...(example !== undefined ? { example } : {}),
});
const int = (description?: string, example?: number): Schema => ({
  type: "integer",
  ...(description ? { description } : {}),
  ...(example !== undefined ? { example } : {}),
});
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const dateTime = (description?: string): Schema => ({ type: "string", format: "date-time", ...(description ? { description } : {}) });
const enumOf = (values: readonly string[], description?: string): Schema => ({
  type: "string",
  enum: [...values],
  ...(description ? { description } : {}),
});

const PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "OUTRA"] as const;
const IDEA_STATUSES = ["NOVA", "EM_DESENVOLVIMENTO", "ARQUIVADA"] as const;
const CONTENT_STAGES = ["IDEIA", "ROTEIRO", "GRAVACAO", "EDICAO", "AGENDADO", "PUBLICADO"] as const;
const CONTENT_FORMATS = ["VIDEO_CURTO", "VIDEO_LONGO", "CARROSSEL", "IMAGEM", "STORY", "LIVE"] as const;
const PLANS = ["FREE", "CREATOR", "STUDIO"] as const;
const ROLES = ["DONO", "GESTOR", "ROTEIRISTA", "EDITOR"] as const;
const ASSIGNABLE_ROLES = ["GESTOR", "ROTEIRISTA", "EDITOR"] as const;

/* ---------- respostas reutilizáveis ---------- */

const json = (schema: Schema, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const noContent = { description: "Sem conteúdo (operação concluída)" };
const errors = {
  badRequest: { $ref: "#/components/responses/BadRequest" },
  unauthorized: { $ref: "#/components/responses/Unauthorized" },
  forbidden: { $ref: "#/components/responses/Forbidden" },
  notFound: { $ref: "#/components/responses/NotFound" },
  planLimit: { $ref: "#/components/responses/PlanLimit" },
  server: { $ref: "#/components/responses/ServerError" },
};
const jsonBody = (schema: Schema, required = true) => ({
  required,
  content: { "application/json": { schema } },
});

const auth = [{ bearerAuth: [] }];
const workspaceParam = { $ref: "#/components/parameters/WorkspaceHeader" };
const idParam = (description: string) => ({
  name: "id",
  in: "path",
  required: true,
  description,
  schema: { type: "integer", minimum: 1 },
});
const query = (name: string, schema: Schema, description: string) => ({ name, in: "query", required: false, description, schema });

/** Rota autenticada que roda no contexto de um workspace (header X-Workspace-Id opcional) */
function workspaceOp(op: {
  tags: string[];
  summary: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}) {
  return {
    ...op,
    security: auth,
    parameters: [workspaceParam, ...(op.parameters ?? [])],
    responses: { ...op.responses, "401": errors.unauthorized, "500": errors.server },
  };
}

/** Rota autenticada sem contexto de workspace */
function authOp(op: {
  tags: string[];
  summary: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}) {
  return { ...op, security: auth, responses: { ...op.responses, "401": errors.unauthorized, "500": errors.server } };
}

/* ---------- schemas ---------- */

const schemas: Record<string, Schema> = {
  Error: obj({ error: str("Mensagem legível para exibir ao usuário", "Conteúdo não encontrado.") }, ["error"]),
  PlanLimitError: obj({
    error: str(undefined, "Você atingiu o limite de 20 ideias ativas do seu plano."),
    code: enumOf(["PLAN_LIMIT_REACHED"]),
    resource: enumOf(["ideias", "conteudosAtivos", "armazenamentoMB", "historicoMetricasDias", "membros"]),
    limit: int(undefined, 20),
  }),
  CodedError: obj({
    error: str(),
    code: enumOf(
      [
        "ROLE_FORBIDDEN",
        "WORKSPACE_FORBIDDEN",
        "PLAN_LIMIT_REACHED",
        "ALREADY_MEMBER",
        "INVITE_ALREADY_PENDING",
        "INVITE_EMAIL_MISMATCH",
        "INVITE_EXPIRADO",
        "INVITE_ACEITO",
        "INVITE_REVOGADO",
        "INVALID_STAGE",
        "CONTENT_NOT_PUBLISHED",
      ],
      "Código estável para o frontend tratar o erro"
    ),
  }),

  User: obj({
    id: str(undefined, "7b1c0f4e-2a9d-4c55-9e0a-1f2b3c4d5e6f"),
    nome: str(undefined, "Ana Souza"),
    email: { type: "string", format: "email", example: "ana@exemplo.com" },
    role: enumOf(["creator", "admin"]),
    plano: enumOf(PLANS),
    bio: nullable(str()),
    fotoPerfil: nullable(str("URL da foto (servida por /api/user/avatar/{filename})")),
    criadoEm: dateTime(),
  }),
  UserMessage: obj({ user: ref("User"), message: str() }),
  Author: nullable(obj({ id: str(), nome: str(), fotoPerfil: nullable(str()) })),
  PlanLimits: obj({
    ideias: nullable(int("null = ilimitado", 20)),
    conteudosAtivos: nullable(int(undefined, 10)),
    armazenamentoMB: nullable(int(undefined, 500)),
    historicoMetricasDias: nullable(int(undefined, 30)),
    membros: nullable(int(undefined, 1)),
  }),

  Usage: obj({
    plano: enumOf(PLANS, "Plano do dono do workspace (é ele que define os limites)"),
    limites: ref("PlanLimits"),
    uso: obj({ ideias: int(), conteudosAtivos: int(), armazenamentoBytes: int(), membros: int() }),
    workspace: obj({ id: str(), nome: str(), pessoal: { type: "boolean" }, souDono: { type: "boolean" }, nomeDono: str() }),
  }),
  WorkspaceSummary: obj({
    id: str(),
    nome: str(undefined, "Canal da Ana"),
    pessoal: { type: "boolean", description: "Workspace criado automaticamente para o usuário" },
    papel: enumOf(ROLES),
    plano: enumOf(PLANS),
    totalMembros: int(undefined, 3),
  }),
  CurrentWorkspace: obj({
    id: str(),
    nome: str(),
    donoId: str(),
    pessoal: { type: "boolean" },
    metaSemanal: int("Publicações por semana", 3),
    criadoEm: dateTime(),
    totalMembros: int(),
    papel: enumOf(ROLES),
    podeGerenciar: { type: "boolean" },
    plano: enumOf(PLANS),
    limites: ref("PlanLimits"),
  }),

  Idea: obj({
    id: int(undefined, 12),
    titulo: str(undefined, "3 erros de iluminação em vídeos verticais"),
    gancho: nullable(str()),
    descricao: nullable(str()),
    legenda: nullable(str()),
    plataforma: nullable(enumOf(PLATFORMS)),
    tags: arrayOf(str(undefined, "iluminacao")),
    status: enumOf(IDEA_STATUSES),
    criadoEm: dateTime(),
    atualizadoEm: dateTime(),
    autor: ref("Author"),
  }),
  IdeaInput: obj({
    titulo: str("Obrigatório na criação; até 150 caracteres"),
    gancho: nullable(str("Até 2000 caracteres")),
    descricao: nullable(str("Até 5000 caracteres")),
    legenda: nullable(str("Até 2200 caracteres")),
    plataforma: nullable(enumOf(PLATFORMS)),
    tags: arrayOf(str()),
    status: enumOf(IDEA_STATUSES),
  }),

  ContentPermissions: obj({
    papel: enumOf(ROLES),
    editarTexto: { type: "boolean" },
    editarPublicacao: { type: "boolean", description: "Data e link de publicação (DONO/GESTOR)" },
    moverPara: arrayOf(enumOf(CONTENT_STAGES)),
    aprovarRoteiro: { type: "boolean" },
    solicitarAjustes: { type: "boolean" },
    excluir: { type: "boolean" },
    moderarComentarios: { type: "boolean" },
  }),
  Content: obj({
    id: int(undefined, 40),
    titulo: str(),
    etapa: enumOf(CONTENT_STAGES),
    posicao: int("Ordem do card na coluna do kanban"),
    plataforma: nullable(enumOf(PLATFORMS)),
    formato: nullable(enumOf(CONTENT_FORMATS)),
    hashtags: arrayOf(str()),
    dataPublicacao: nullable(dateTime()),
    urlPublicacao: nullable(str()),
    ideiaId: nullable(int()),
    criadoEm: dateTime(),
    atualizadoEm: dateTime(),
    autor: ref("Author"),
    roteiroAprovadoEm: nullable(dateTime()),
    comentariosAbertos: int("Comentários de revisão não resolvidos"),
    permissoes: ref("ContentPermissions"),
  }),
  ContentDetail: {
    allOf: [
      ref("Content"),
      obj({
        roteiro: nullable(str()),
        legenda: nullable(str()),
        ideia: nullable(obj({ id: int(), titulo: str() })),
        roteiroAprovadoPor: nullable(obj({ id: str(), nome: str() })),
      }),
    ],
  },
  ContentInput: obj({
    titulo: str("Obrigatório na criação; até 150 caracteres"),
    roteiro: nullable(str("Até 50.000 caracteres")),
    legenda: nullable(str("Até 2200 caracteres")),
    hashtags: arrayOf(str()),
    plataforma: nullable(enumOf(PLATFORMS)),
    formato: nullable(enumOf(CONTENT_FORMATS)),
    dataPublicacao: nullable(dateTime("Apenas DONO/GESTOR")),
    urlPublicacao: nullable(str("Link http(s), até 500 caracteres. Apenas DONO/GESTOR")),
  }),
  ContentResponse: obj({ conteudo: ref("ContentDetail") }),

  Comment: obj({
    id: int(),
    texto: str(),
    tipo: enumOf(["COMENTARIO", "APROVACAO", "AJUSTE"]),
    etapa: enumOf(CONTENT_STAGES, "Etapa do conteúdo quando o comentário foi feito"),
    resolvido: { type: "boolean" },
    resolvidoEm: nullable(dateTime()),
    criadoEm: dateTime(),
    atualizadoEm: dateTime(),
    autor: ref("Author"),
    resolvidoPor: nullable(obj({ id: str(), nome: str() })),
    podeEditar: { type: "boolean" },
    podeExcluir: { type: "boolean" },
    podeResolver: { type: "boolean" },
  }),

  Attachment: obj({
    id: int(),
    conteudoId: int(),
    nomeOriginal: str(undefined, "bruto-take-2.mp4"),
    tipoMime: str(undefined, "video/mp4"),
    tamanhoBytes: int(),
    criadoEm: dateTime(),
    autor: nullable(obj({ id: str(), nome: str() })),
  }),
  StorageUsage: obj({ usadoBytes: int(), limiteBytes: nullable(int("null = ilimitado")) }),

  MetricValues: obj({
    visualizacoes: int(undefined, 15200),
    curtidas: int(undefined, 1300),
    comentarios: int(undefined, 85),
    compartilhamentos: int(undefined, 120),
    salvamentos: int(undefined, 340),
    alcance: nullable(int()),
    seguidoresGanhos: nullable(int()),
  }),
  Metric: {
    allOf: [
      ref("MetricValues"),
      obj({
        id: int(),
        coletadoEm: dateTime(),
        criadoEm: dateTime(),
        registradoPor: nullable(obj({ id: str(), nome: str() })),
        taxaEngajamento: nullable({ type: "number", description: "Interações ÷ visualizações (0 a 1)", example: 0.121 }),
      }),
    ],
  },

  TeamMember: obj({
    id: int(),
    papel: enumOf(ROLES),
    criadoEm: dateTime(),
    usuario: obj({ id: str(), nome: str(), email: str(), fotoPerfil: nullable(str()) }),
    souEu: { type: "boolean" },
  }),
  Invite: obj({
    id: int(),
    email: str(),
    papel: enumOf(ASSIGNABLE_ROLES),
    status: enumOf(["PENDENTE", "ACEITO", "REVOGADO"]),
    estado: enumOf(["PENDENTE", "EXPIRADO", "ACEITO", "REVOGADO"], "Status considerando a validade"),
    expiraEm: dateTime(),
    criadoEm: dateTime(),
    convidadoPor: nullable(obj({ id: str(), nome: str() })),
  }),
  InviteDelivery: obj({
    convite: ref("Invite"),
    link: str("Link de aceite. Só é devolvido aqui: o banco guarda apenas o hash do token"),
    emailEnviado: { type: "boolean" },
  }),

  PlanOffer: obj({
    plano: enumOf(PLANS),
    nome: str(undefined, "Kreato Creator"),
    descricao: str(),
    precoCentavos: int(undefined, 2990),
    moeda: enumOf(["brl"]),
    limites: ref("PlanLimits"),
  }),
};

/* ---------- tags e caminhos ---------- */

const T = {
  user: "Usuário e perfil",
  workspace: "Workspaces e uso do plano",
  dashboard: "Painel do criador",
  team: "Equipe",
  invites: "Convites",
  ideas: "Ideias",
  contents: "Conteúdos (pipeline)",
  review: "Revisão de roteiro",
  attachments: "Anexos",
  metrics: "Métricas",
  billing: "Planos e assinatura (Stripe)",
  admin: "Administração",
};

const paths: Record<string, Record<string, unknown>> = {
  /* ===== Usuário ===== */
  "/api/users": {
    get: authOp({
      tags: [T.user],
      summary: "Listar usuários",
      responses: { "200": json(obj({ users: arrayOf(ref("User")) }), "Usuários cadastrados") },
    }),
  },
  "/api/user/profile": {
    get: authOp({
      tags: [T.user],
      summary: "Perfil do usuário logado",
      responses: { "200": json(obj({ user: ref("User") }), "Perfil"), "404": errors.notFound },
    }),
    put: authOp({
      tags: [T.user],
      summary: "Atualizar nome e bio",
      requestBody: jsonBody(obj({ nome: str(), bio: nullable(str()) })),
      responses: { "200": json(ref("UserMessage"), "Perfil atualizado"), "400": errors.badRequest },
    }),
  },
  "/api/user/avatar": {
    post: authOp({
      tags: [T.user],
      summary: "Enviar foto de perfil",
      description: "Imagem de até 5 MB, guardada no MinIO.",
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: obj({ avatar: { type: "string", format: "binary" } }, ["avatar"]),
          },
        },
      },
      responses: { "200": json(ref("UserMessage"), "Foto atualizada"), "400": errors.badRequest },
    }),
    delete: authOp({
      tags: [T.user],
      summary: "Remover foto de perfil",
      responses: { "200": json(ref("UserMessage"), "Foto removida") },
    }),
  },
  "/api/user/avatar/{filename}": {
    get: {
      tags: [T.user],
      summary: "Baixar foto de perfil (público)",
      parameters: [{ name: "filename", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Imagem", content: { "image/*": { schema: { type: "string", format: "binary" } } } },
        "404": errors.notFound,
      },
    },
  },

  /* ===== Workspaces ===== */
  "/api/user/usage": {
    get: workspaceOp({
      tags: [T.workspace],
      summary: "Uso do workspace atual frente aos limites do plano",
      responses: { "200": json(ref("Usage"), "Uso e limites") },
    }),
  },
  "/api/workspaces": {
    get: authOp({
      tags: [T.workspace],
      summary: "Workspaces dos quais o usuário participa",
      description: "Cria o workspace pessoal na primeira chamada, se ainda não existir.",
      responses: { "200": json(obj({ workspaces: arrayOf(ref("WorkspaceSummary")) }), "Lista de workspaces") },
    }),
  },
  "/api/workspaces/current": {
    get: workspaceOp({
      tags: [T.workspace],
      summary: "Workspace atual com papel, plano e limites",
      responses: { "200": json(obj({ workspace: ref("CurrentWorkspace") }), "Workspace atual"), "403": errors.forbidden },
    }),
    patch: workspaceOp({
      tags: [T.workspace],
      summary: "Renomear workspace ou mudar a meta semanal (DONO/GESTOR)",
      requestBody: jsonBody(
        obj({ nome: str("1 a 100 caracteres"), metaSemanal: int("Publicações por semana (1 a 21)", 3) })
      ),
      responses: {
        "200": json(
          obj({ workspace: obj({ id: str(), nome: str(), metaSemanal: int() }), message: str() }),
          "Workspace atualizado"
        ),
        "400": errors.badRequest,
        "403": errors.forbidden,
      },
    }),
  },
  "/api/dashboard": {
    get: workspaceOp({
      tags: [T.dashboard],
      summary: "Resumo da tela inicial",
      description: "Meta da semana e sequência, contagem por etapa, agenda, ideias novas e desempenho recente.",
      parameters: [
        query("inicioSemana", { type: "string", format: "date-time" }, "Início da semana no fuso do usuário (padrão: segunda-feira UTC)"),
      ],
      responses: {
        "200": json(
          obj({
            meta: { type: "object", description: "Meta semanal, progresso e sequência de semanas cumpridas" },
            pipeline: obj({ porEtapa: { type: "object", additionalProperties: { type: "integer" } }, ativos: int() }),
            agenda: obj({
              atrasados: arrayOf(ref("Content")),
              totalAtrasados: int(),
              proximos: arrayOf(ref("Content")),
              dias: int(),
            }),
            ideias: obj({ novas: int(), recentes: arrayOf(ref("Idea")) }),
            desempenho: obj({ dias: int(), totais: { type: "object" }, destaque: nullable({ type: "object" }) }),
          }),
          "Dados do painel"
        ),
      },
    }),
  },

  /* ===== Equipe ===== */
  "/api/membros": {
    get: workspaceOp({
      tags: [T.team],
      summary: "Membros do workspace e vagas do plano",
      responses: {
        "200": json(
          obj({
            membros: arrayOf(ref("TeamMember")),
            meuPapel: enumOf(ROLES),
            podeGerenciar: { type: "boolean" },
            vagas: obj({ membros: int(), convitesPendentes: int(), limite: nullable(int()) }),
          }),
          "Equipe"
        ),
      },
    }),
  },
  "/api/membros/{id}": {
    patch: workspaceOp({
      tags: [T.team],
      summary: "Alterar papel de um membro",
      description: "DONO altera qualquer membro; GESTOR só altera roteiristas e editores. Ninguém altera o próprio papel.",
      parameters: [idParam("ID do vínculo (membro)")],
      requestBody: jsonBody(obj({ papel: enumOf(ASSIGNABLE_ROLES) }, ["papel"])),
      responses: {
        "200": json(obj({ membro: ref("TeamMember") }), "Papel alterado"),
        "400": errors.badRequest,
        "403": errors.forbidden,
        "404": errors.notFound,
      },
    }),
    delete: workspaceOp({
      tags: [T.team],
      summary: "Remover membro da equipe",
      parameters: [idParam("ID do vínculo (membro)")],
      responses: { "204": noContent, "400": errors.badRequest, "403": errors.forbidden, "404": errors.notFound },
    }),
  },
  "/api/membros/sair": {
    post: workspaceOp({
      tags: [T.team],
      summary: "Sair do workspace atual",
      description: "O DONO não pode sair do próprio workspace.",
      responses: { "204": noContent, "400": errors.badRequest },
    }),
  },

  /* ===== Convites ===== */
  "/api/convites": {
    get: workspaceOp({
      tags: [T.invites],
      summary: "Convites pendentes (inclusive expirados) — DONO/GESTOR",
      responses: { "200": json(obj({ convites: arrayOf(ref("Invite")) }), "Convites"), "403": errors.forbidden },
    }),
    post: workspaceOp({
      tags: [T.invites],
      summary: "Convidar por e-mail — DONO/GESTOR",
      description:
        "Convites pendentes ocupam vaga do plano. Só o DONO convida gestores. Limite de 20 convites por workspace a cada 24h.",
      requestBody: jsonBody(
        obj({ email: { type: "string", format: "email" }, papel: enumOf(ASSIGNABLE_ROLES, "Padrão: EDITOR") }, ["email"])
      ),
      responses: {
        "201": json(ref("InviteDelivery"), "Convite criado"),
        "400": errors.badRequest,
        "403": errors.planLimit,
        "409": json(ref("CodedError"), "Já é membro ou já existe convite pendente"),
        "429": json(ref("Error"), "Muitos convites nas últimas 24h"),
      },
    }),
  },
  "/api/convites/{id}/reenviar": {
    post: workspaceOp({
      tags: [T.invites],
      summary: "Reenviar convite (gera novo link e renova a validade)",
      parameters: [idParam("ID do convite")],
      responses: {
        "200": json(ref("InviteDelivery"), "Convite reenviado"),
        "403": errors.forbidden,
        "404": errors.notFound,
        "429": json(ref("Error"), "Muitos convites nas últimas 24h"),
      },
    }),
  },
  "/api/convites/{id}": {
    delete: workspaceOp({
      tags: [T.invites],
      summary: "Cancelar convite",
      parameters: [idParam("ID do convite")],
      responses: { "204": noContent, "403": errors.forbidden, "404": errors.notFound },
    }),
  },
  "/api/convites/token/{token}": {
    get: {
      tags: [T.invites],
      summary: "Dados do convite para a tela de aceite (público)",
      parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": json(
          obj({
            convite: obj({
              email: str(),
              papel: enumOf(ASSIGNABLE_ROLES),
              estado: enumOf(["PENDENTE", "EXPIRADO", "ACEITO", "REVOGADO"]),
              expiraEm: dateTime(),
              workspace: str("Nome do workspace"),
              convidadoPor: nullable(str()),
            }),
          }),
          "Convite"
        ),
        "404": errors.notFound,
      },
    },
  },
  "/api/convites/aceitar": {
    post: authOp({
      tags: [T.invites],
      summary: "Aceitar convite",
      description: "Exige estar logado com o mesmo e-mail do convite. Rechecagem de vaga no momento do aceite.",
      requestBody: jsonBody(obj({ token: str() }, ["token"])),
      responses: {
        "200": json(obj({ workspace: obj({ id: str(), nome: str() }), papel: enumOf(ASSIGNABLE_ROLES) }), "Agora você faz parte da equipe"),
        "400": errors.badRequest,
        "403": json(ref("CodedError"), "INVITE_EMAIL_MISMATCH (outra conta) ou PLAN_LIMIT_REACHED (equipe completa)"),
        "404": errors.notFound,
        "409": json(ref("Error"), "O convite acabou de ser usado em outra requisição"),
        "410": json(ref("CodedError"), "INVITE_EXPIRADO, INVITE_ACEITO ou INVITE_REVOGADO"),
      },
    }),
  },

  /* ===== Ideias ===== */
  "/api/ideias": {
    get: workspaceOp({
      tags: [T.ideas],
      summary: "Listar ideias",
      description: "Sem filtro de status, retorna só as não arquivadas.",
      parameters: [
        query("status", enumOf(IDEA_STATUSES), "Filtrar por status"),
        query("plataforma", enumOf(PLATFORMS), "Filtrar por plataforma"),
        query("tag", { type: "string" }, "Filtrar por tag"),
        query("busca", { type: "string" }, "Busca no título, gancho e descrição"),
      ],
      responses: {
        "200": json(
          obj({ ideias: arrayOf(ref("Idea")), uso: obj({ ideiasAtivas: int(), limite: nullable(int()) }) }),
          "Ideias e uso do plano"
        ),
      },
    }),
    post: workspaceOp({
      tags: [T.ideas],
      summary: "Criar ideia",
      requestBody: jsonBody(ref("IdeaInput")),
      responses: { "201": json(obj({ ideia: ref("Idea") }), "Ideia criada"), "400": errors.badRequest, "403": errors.planLimit },
    }),
  },
  "/api/ideias/{id}": {
    get: workspaceOp({
      tags: [T.ideas],
      summary: "Detalhar ideia",
      parameters: [idParam("ID da ideia")],
      responses: { "200": json(obj({ ideia: ref("Idea") }), "Ideia"), "404": errors.notFound },
    }),
    patch: workspaceOp({
      tags: [T.ideas],
      summary: "Atualizar ideia (parcial)",
      parameters: [idParam("ID da ideia")],
      requestBody: jsonBody(ref("IdeaInput")),
      responses: {
        "200": json(obj({ ideia: ref("Idea") }), "Ideia atualizada"),
        "400": errors.badRequest,
        "403": errors.planLimit,
        "404": errors.notFound,
      },
    }),
    delete: workspaceOp({
      tags: [T.ideas],
      summary: "Excluir ideia (autor ou DONO/GESTOR)",
      parameters: [idParam("ID da ideia")],
      responses: { "204": noContent, "403": errors.forbidden, "404": errors.notFound },
    }),
  },
  "/api/ideias/{id}/converter": {
    post: workspaceOp({
      tags: [T.ideas, T.contents],
      summary: "Levar ideia para o pipeline",
      description: "Cria um conteúdo a partir da ideia (uma vez por ideia). Etapa padrão: ROTEIRO.",
      parameters: [idParam("ID da ideia")],
      requestBody: jsonBody(obj({ etapa: enumOf(CONTENT_STAGES) }), false),
      responses: {
        "201": json(ref("ContentResponse"), "Conteúdo criado"),
        "400": errors.badRequest,
        "403": errors.planLimit,
        "404": errors.notFound,
        "409": json(ref("Error"), "Ideia já convertida"),
      },
    }),
  },

  /* ===== Conteúdos ===== */
  "/api/conteudos": {
    get: workspaceOp({
      tags: [T.contents],
      summary: "Listar conteúdos do pipeline",
      parameters: [
        query("etapa", { type: "string" }, `Uma ou mais etapas separadas por vírgula (${CONTENT_STAGES.join(", ")})`),
        query("plataforma", enumOf(PLATFORMS), "Filtrar por plataforma"),
        query("formato", enumOf(CONTENT_FORMATS), "Filtrar por formato"),
        query("de", { type: "string", format: "date-time" }, "Data de publicação a partir de"),
        query("ate", { type: "string", format: "date-time" }, "Data de publicação até"),
        query("busca", { type: "string" }, "Busca no título"),
      ],
      responses: {
        "200": json(
          obj({
            conteudos: arrayOf(ref("Content")),
            uso: obj({ conteudosAtivos: int(), limite: nullable(int()) }),
            permissoes: obj({ papel: enumOf(ROLES), criarEm: arrayOf(enumOf(CONTENT_STAGES)) }),
          }),
          "Conteúdos, uso do plano e etapas em que o papel pode criar"
        ),
        "400": errors.badRequest,
      },
    }),
    post: workspaceOp({
      tags: [T.contents],
      summary: "Criar conteúdo",
      description: "ROTEIRISTA só cria em IDEIA/ROTEIRO; EDITOR não cria.",
      requestBody: jsonBody({ allOf: [ref("ContentInput"), obj({ etapa: enumOf(CONTENT_STAGES, "Padrão: IDEIA") })] }),
      responses: {
        "201": json(ref("ContentResponse"), "Conteúdo criado"),
        "400": errors.badRequest,
        "403": errors.planLimit,
      },
    }),
  },
  "/api/conteudos/{id}": {
    get: workspaceOp({
      tags: [T.contents],
      summary: "Detalhar conteúdo (com roteiro e legenda)",
      parameters: [idParam("ID do conteúdo")],
      responses: { "200": json(ref("ContentResponse"), "Conteúdo"), "404": errors.notFound },
    }),
    patch: workspaceOp({
      tags: [T.contents],
      summary: "Atualizar campos do conteúdo (parcial)",
      description:
        "Etapa e posição mudam por PATCH /etapa. Textos: DONO/GESTOR, ou ROTEIRISTA enquanto em IDEIA/ROTEIRO. Data/link: só DONO/GESTOR.",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody(ref("ContentInput")),
      responses: {
        "200": json(ref("ContentResponse"), "Conteúdo atualizado"),
        "400": errors.badRequest,
        "403": json(ref("CodedError"), "ROLE_FORBIDDEN: campo não permitido para o papel"),
        "404": errors.notFound,
      },
    }),
    delete: workspaceOp({
      tags: [T.contents],
      summary: "Excluir conteúdo",
      description: "DONO/GESTOR; o ROTEIRISTA autor enquanto está em IDEIA/ROTEIRO. Apaga também anexos e métricas.",
      parameters: [idParam("ID do conteúdo")],
      responses: { "204": noContent, "403": json(ref("CodedError"), "ROLE_FORBIDDEN"), "404": errors.notFound },
    }),
  },
  "/api/conteudos/{id}/etapa": {
    patch: workspaceOp({
      tags: [T.contents],
      summary: "Mover conteúdo no kanban (etapa e/ou posição)",
      description:
        "ROTEIRISTA move entre IDEIA e ROTEIRO; EDITOR entre GRAVACAO e EDICAO. Sair de ROTEIRO para a produção aprova o roteiro (só DONO/GESTOR). AGENDADO exige data; PUBLICADO sem data assume agora.",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody(
        obj(
          {
            etapa: enumOf(CONTENT_STAGES),
            posicao: int("Índice na coluna de destino (padrão: fim)"),
            dataPublicacao: nullable(dateTime("Apenas DONO/GESTOR")),
            urlPublicacao: nullable(str("Apenas DONO/GESTOR")),
          },
          ["etapa"]
        )
      ),
      responses: {
        "200": json(ref("ContentResponse"), "Conteúdo movido"),
        "400": errors.badRequest,
        "403": json({ oneOf: [ref("CodedError"), ref("PlanLimitError")] }, "ROLE_FORBIDDEN ou PLAN_LIMIT_REACHED"),
        "404": errors.notFound,
      },
    }),
  },

  /* ===== Revisão ===== */
  "/api/conteudos/{id}/comentarios": {
    get: workspaceOp({
      tags: [T.review],
      summary: "Comentários de revisão do conteúdo",
      parameters: [idParam("ID do conteúdo")],
      responses: { "200": json(obj({ comentarios: arrayOf(ref("Comment")) }), "Comentários"), "404": errors.notFound },
    }),
    post: workspaceOp({
      tags: [T.review],
      summary: "Comentar (qualquer membro)",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody(obj({ texto: str("Até 2000 caracteres") }, ["texto"])),
      responses: { "201": json(obj({ comentario: ref("Comment") }), "Comentário criado"), "400": errors.badRequest, "404": errors.notFound },
    }),
  },
  "/api/comentarios/{id}": {
    patch: workspaceOp({
      tags: [T.review],
      summary: "Editar texto ou resolver/reabrir comentário",
      description: "Texto: só o autor (tipo COMENTARIO). Resolver: autor do comentário, autor do conteúdo ou DONO/GESTOR.",
      parameters: [idParam("ID do comentário")],
      requestBody: jsonBody(obj({ texto: str(), resolvido: { type: "boolean" } })),
      responses: {
        "200": json(obj({ comentario: ref("Comment") }), "Comentário atualizado"),
        "400": errors.badRequest,
        "403": errors.forbidden,
        "404": errors.notFound,
      },
    }),
    delete: workspaceOp({
      tags: [T.review],
      summary: "Excluir comentário (autor ou DONO/GESTOR)",
      parameters: [idParam("ID do comentário")],
      responses: { "204": noContent, "403": errors.forbidden, "404": errors.notFound },
    }),
  },
  "/api/conteudos/{id}/aprovar-roteiro": {
    post: workspaceOp({
      tags: [T.review],
      summary: "Aprovar roteiro (DONO/GESTOR)",
      description: "Conteúdo precisa estar em ROTEIRO. Resolve os ajustes pendentes, registra a aprovação e move para GRAVACAO.",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody(obj({ texto: str("Observação opcional, até 2000 caracteres") }), false),
      responses: {
        "200": json(obj({ message: str() }), "Roteiro aprovado"),
        "400": errors.badRequest,
        "403": errors.forbidden,
        "404": errors.notFound,
        "409": json(ref("Error"), "Conteúdo fora da etapa ROTEIRO"),
      },
    }),
  },
  "/api/conteudos/{id}/solicitar-ajustes": {
    post: workspaceOp({
      tags: [T.review],
      summary: "Pedir ajustes no roteiro (DONO/GESTOR)",
      description: "Conteúdo em ROTEIRO ou GRAVACAO. Cria um comentário AJUSTE, desfaz a aprovação e volta para ROTEIRO se estava em GRAVACAO.",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody(obj({ texto: str("O que precisa mudar (até 2000 caracteres)") }, ["texto"])),
      responses: {
        "200": json(obj({ message: str() }), "Ajustes solicitados"),
        "400": errors.badRequest,
        "403": errors.forbidden,
        "404": errors.notFound,
        "409": json(ref("Error"), "Etapa não permite pedir ajustes"),
      },
    }),
  },

  /* ===== Anexos ===== */
  "/api/conteudos/{id}/anexos": {
    get: workspaceOp({
      tags: [T.attachments],
      summary: "Anexos do conteúdo e uso de armazenamento",
      parameters: [idParam("ID do conteúdo")],
      responses: {
        "200": json(obj({ anexos: arrayOf(ref("Attachment")), uso: ref("StorageUsage") }), "Anexos"),
        "404": errors.notFound,
      },
    }),
    post: workspaceOp({
      tags: [T.attachments],
      summary: "Enviar anexo",
      description: "Um arquivo por requisição no campo `arquivo`. Vídeos, imagens, áudios e PDFs; conta no armazenamento do plano.",
      parameters: [idParam("ID do conteúdo")],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": { schema: obj({ arquivo: { type: "string", format: "binary" } }, ["arquivo"]) },
        },
      },
      responses: {
        "201": json(obj({ anexo: ref("Attachment"), uso: ref("StorageUsage") }), "Anexo enviado"),
        "400": errors.badRequest,
        "403": errors.planLimit,
        "404": errors.notFound,
        "413": json(ref("Error"), "Arquivo maior que o permitido"),
        "415": json(ref("Error"), "Tipo de arquivo não suportado"),
      },
    }),
  },
  "/api/anexos/{id}/arquivo": {
    get: workspaceOp({
      tags: [T.attachments],
      summary: "Baixar arquivo do anexo",
      parameters: [idParam("ID do anexo")],
      responses: {
        "200": { description: "Arquivo", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        "404": errors.notFound,
      },
    }),
  },
  "/api/anexos/{id}": {
    delete: workspaceOp({
      tags: [T.attachments],
      summary: "Excluir anexo (quem enviou ou DONO/GESTOR)",
      parameters: [idParam("ID do anexo")],
      responses: { "204": noContent, "403": errors.forbidden, "404": errors.notFound },
    }),
  },

  /* ===== Métricas ===== */
  "/api/metricas/resumo": {
    get: workspaceOp({
      tags: [T.metrics],
      summary: "Resumo de desempenho dos conteúdos publicados",
      description: "Usa a medição mais recente de cada conteúdo. No plano Free, o período é limitado ao histórico do plano.",
      parameters: [
        query("de", { type: "string", format: "date-time" }, "Início (padrão: 30 dias atrás)"),
        query("ate", { type: "string", format: "date-time" }, "Fim (padrão: agora)"),
        query("plataforma", enumOf(PLATFORMS), "Filtrar por plataforma"),
        query("formato", enumOf(CONTENT_FORMATS), "Filtrar por formato"),
      ],
      responses: {
        "200": json(
          obj({
            periodo: obj({ de: dateTime(), ate: dateTime(), limitadoPeloPlano: { type: "boolean" }, historicoDias: nullable(int()) }),
            totais: { type: "object", description: "Somatório das métricas e taxa de engajamento" },
            porPlataforma: arrayOf({ type: "object" }),
            porFormato: arrayOf({ type: "object" }),
            conteudos: arrayOf({ type: "object" }),
          }),
          "Resumo"
        ),
        "400": errors.badRequest,
      },
    }),
  },
  "/api/conteudos/{id}/metricas": {
    get: workspaceOp({
      tags: [T.metrics],
      summary: "Evolução das métricas de um conteúdo",
      parameters: [idParam("ID do conteúdo")],
      responses: {
        "200": json(
          obj({
            metricas: arrayOf(ref("Metric")),
            ultima: nullable(ref("Metric")),
            historico: obj({ dias: nullable(int()), ocultas: int("Medições fora da janela do plano") }),
          }),
          "Métricas"
        ),
        "404": errors.notFound,
      },
    }),
    post: workspaceOp({
      tags: [T.metrics],
      summary: "Registrar métricas (conteúdo publicado)",
      parameters: [idParam("ID do conteúdo")],
      requestBody: jsonBody({ allOf: [ref("MetricValues"), obj({ coletadoEm: dateTime("Padrão: agora; não pode ser futura") })] }),
      responses: {
        "201": json(obj({ metrica: ref("Metric") }), "Métricas registradas"),
        "400": json(ref("CodedError"), "Dados inválidos ou conteúdo ainda não publicado (CONTENT_NOT_PUBLISHED)"),
        "404": errors.notFound,
      },
    }),
  },
  "/api/metricas/{id}": {
    delete: workspaceOp({
      tags: [T.metrics],
      summary: "Excluir medição (quem registrou ou DONO/GESTOR)",
      parameters: [idParam("ID da medição")],
      responses: { "204": noContent, "403": errors.forbidden, "404": errors.notFound },
    }),
  },

  /* ===== Planos e Stripe ===== */
  "/api/stripe/plans": {
    get: {
      tags: [T.billing],
      summary: "Catálogo de planos (público)",
      responses: {
        "200": json(
          obj({
            planos: arrayOf(ref("PlanOffer")),
            stripeConfigurado: { type: "boolean" },
            modoTeste: { type: "boolean", description: "Ativação simulada disponível (fora de produção)" },
          }),
          "Planos"
        ),
      },
    },
  },
  "/api/stripe/create-checkout-session": {
    post: authOp({
      tags: [T.billing],
      summary: "Assinar ou trocar de plano",
      description:
        "Gratuito: abre o Stripe Checkout. Assinante do mesmo plano: portal do cliente. Assinante de outro plano: troca o preço da assinatura (proporcional) e devolve o usuário atualizado.",
      requestBody: jsonBody(obj({ plano: enumOf(["CREATOR", "STUDIO"], "Padrão: CREATOR") }), false),
      responses: {
        "200": json(
          obj({
            url: str("Para onde redirecionar (Checkout, portal ou retorno simulado)"),
            id: str("ID da sessão do Checkout"),
            changed: { type: "boolean", description: "true quando o plano foi trocado direto" },
            user: ref("User"),
            mockActivated: { type: "boolean" },
            message: str(),
          }),
          "Próximo passo do fluxo"
        ),
        "400": errors.badRequest,
        "409": json(ref("Error"), "Assinatura inconsistente no Stripe"),
      },
    }),
  },
  "/api/stripe/verify-session": {
    post: authOp({
      tags: [T.billing],
      summary: "Confirmar o retorno do Checkout",
      description: "Valida a sessão paga no Stripe antes de liberar o plano. A ativação simulada só funciona fora de produção.",
      requestBody: jsonBody(obj({ sessionId: str(), plano: enumOf(["CREATOR", "STUDIO"]) })),
      responses: {
        "200": json(obj({ user: ref("User"), success: { type: "boolean" } }), "Plano ativado"),
        "400": errors.badRequest,
        "402": json(ref("Error"), "Pagamento ainda não confirmado pelo Stripe"),
        "403": errors.forbidden,
      },
    }),
  },
  "/api/stripe/webhook": {
    post: {
      tags: [T.billing],
      summary: "Webhook do Stripe",
      description:
        "Chamado pelo Stripe. Exige o header Stripe-Signature, validado sobre o corpo bruto com STRIPE_WEBHOOK_SECRET. Sincroniza o plano com a assinatura.",
      parameters: [{ name: "Stripe-Signature", in: "header", required: true, schema: { type: "string" } }],
      requestBody: jsonBody({ type: "object", description: "Evento do Stripe" }),
      responses: {
        "200": json(obj({ received: { type: "boolean" } }), "Evento processado"),
        "400": errors.badRequest,
        "503": json(ref("Error"), "Webhook não configurado (sem STRIPE_WEBHOOK_SECRET)"),
      },
    },
  },
  "/api/stripe/mock-upgrade": {
    post: authOp({
      tags: [T.billing],
      summary: "Ativar plano sem pagamento (somente fora de produção)",
      requestBody: jsonBody(obj({ plano: enumOf(PLANS) })),
      responses: { "200": json(ref("UserMessage"), "Plano ativado"), "400": errors.badRequest, "403": errors.forbidden },
    }),
  },
  "/api/stripe/cancel": {
    post: authOp({
      tags: [T.billing],
      summary: "Cancelar assinatura e voltar ao Gratuito",
      responses: { "200": json(ref("UserMessage"), "Assinatura cancelada"), "502": json(ref("Error"), "Falha ao cancelar no Stripe") },
    }),
  },

  /* ===== Admin ===== */
  "/api/admin/metricas": {
    get: authOp({
      tags: [T.admin],
      summary: "Métricas da plataforma inteira (role admin)",
      description: "Eventos de uso e segurança ficam no log-service: GET /api/logs/stats.",
      parameters: [query("dias", { type: "integer", minimum: 1, maximum: 90, default: 30 }, "Tamanho do período, terminando hoje (UTC)")],
      responses: {
        "200": json(
          obj({
            periodo: obj({ dias: int(), inicio: dateTime(), fim: dateTime() }),
            usuarios: obj({
              total: int(),
              novos: int(),
              porPlano: obj({ FREE: int(), CREATOR: int(), STUDIO: int() }),
              pagantes: int(),
              mrrEstimadoCentavos: int("Pelo preço de tabela"),
              novosPorDia: arrayOf(obj({ dia: str(undefined, "2026-11-06"), total: int() })),
            }),
            workspaces: obj({ total: int(), comEquipe: int(), convitesPendentes: int() }),
            conteudos: obj({
              total: int(),
              porEtapa: arrayOf(obj({ etapa: enumOf(CONTENT_STAGES), total: int() })),
              criadosNoPeriodo: int(),
              publicadosNoPeriodo: int(),
              publicadosPorDia: arrayOf(obj({ dia: str(), total: int() })),
              roteirosAprovados: int(),
              comentarios: int(),
            }),
            ideias: obj({ ativas: int() }),
            armazenamento: obj({ bytes: int() }),
          }),
          "Métricas"
        ),
        "403": errors.forbidden,
      },
    }),
  },
};

export const backendSwaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Kreato - API principal (Backend)",
    version: "1.0.0",
    description: [
      "API do Kreato para criadores de conteúdo: ideias, pipeline de produção, revisão de roteiro, calendário, anexos, métricas, equipes e assinaturas.",
      "",
      "**Autenticação:** envie o JWT do Auth Service em `Authorization: Bearer <token>` (obtido em `POST /api/auth`).",
      "",
      "**Workspace:** rotas de dados rodam no workspace pessoal do usuário, ou no informado em `X-Workspace-Id`. Os limites vêm do plano do dono do workspace.",
      "",
      "**Prefixo:** toda rota também responde sem `/api` (ex.: `GET /conteudos`), caminho usado ao chamar a porta 3333 direto.",
      "",
      "**Erros:** sempre `{ error }`; alguns trazem `code` (`PLAN_LIMIT_REACHED`, `ROLE_FORBIDDEN`, `WORKSPACE_FORBIDDEN`, ...).",
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:8209", description: "Gateway Nginx (Docker Compose)" },
    { url: "http://localhost:3333", description: "Backend direto (use as rotas sem /api ou com /api)" },
  ],
  tags: Object.values(T).map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Token emitido pelo Auth Service" },
    },
    parameters: {
      WorkspaceHeader: {
        name: "X-Workspace-Id",
        in: "header",
        required: false,
        description: "Workspace da requisição. Sem o header, usa o workspace pessoal do usuário.",
        schema: { type: "string" },
      },
    },
    responses: {
      BadRequest: json(ref("Error"), "Dados inválidos"),
      Unauthorized: json(ref("Error"), "Token ausente, inválido ou expirado"),
      Forbidden: json(ref("CodedError"), "Sem permissão (papel no workspace, role ou acesso ao workspace)"),
      NotFound: json(ref("Error"), "Não encontrado (ou de outro workspace)"),
      PlanLimit: json(ref("PlanLimitError"), "Limite do plano atingido (PLAN_LIMIT_REACHED) ou sem permissão"),
      ServerError: json(ref("Error"), "Erro interno"),
    },
    schemas,
  },
};
