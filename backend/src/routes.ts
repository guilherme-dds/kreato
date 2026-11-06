import { Router } from "express";
import multer from "multer";
import { UserController } from "./controller/UserController.js";
import { StripeController } from "./controller/StripeController.js";
import { WorkspaceController } from "./controller/WorkspaceController.js";
import { IdeaController } from "./controller/IdeaController.js";
import { ContentController } from "./controller/ContentController.js";
import { AttachmentController, attachmentUpload } from "./controller/AttachmentController.js";
import { MetricController } from "./controller/MetricController.js";
import { DashboardController } from "./controller/DashboardController.js";
import { TeamController } from "./controller/TeamController.js";
import { InviteController } from "./controller/InviteController.js";
import { ReviewController } from "./controller/ReviewController.js";
import { AuthMiddleware } from "./middlewares/auth.js";
import { WorkspaceMiddleware, requireWorkspaceRole } from "./middlewares/workspace.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

const usercontroller = new UserController();
const stripeController = new StripeController();
const workspaceController = new WorkspaceController();
const ideaController = new IdeaController();
const contentController = new ContentController();
const attachmentController = new AttachmentController();
const metricController = new MetricController();
const dashboardController = new DashboardController();
const teamController = new TeamController();
const inviteController = new InviteController();
const reviewController = new ReviewController();

export const router = Router();

// Users Routes
router.get("/users", AuthMiddleware, usercontroller.index);
router.get("/api/users", AuthMiddleware, usercontroller.index);

router.get("/user/profile", AuthMiddleware, (req, res) => usercontroller.getProfile(req, res));
router.get("/api/user/profile", AuthMiddleware, (req, res) => usercontroller.getProfile(req, res));

router.put("/user/profile", AuthMiddleware, (req, res) => usercontroller.updateProfile(req, res));
router.put("/api/user/profile", AuthMiddleware, (req, res) => usercontroller.updateProfile(req, res));

// User Profile Avatar Routes (MinIO Upload & Serving)
router.post(
  "/user/avatar",
  AuthMiddleware,
  upload.single("avatar"),
  (req, res) => usercontroller.uploadAvatar(req, res)
);
router.post(
  "/api/user/avatar",
  AuthMiddleware,
  upload.single("avatar"),
  (req, res) => usercontroller.uploadAvatar(req, res)
);

router.get("/user/avatar/:filename", (req, res) => usercontroller.serveAvatar(req, res));
router.get("/api/user/avatar/:filename", (req, res) => usercontroller.serveAvatar(req, res));

router.delete("/user/avatar", AuthMiddleware, (req, res) => usercontroller.removeAvatar(req, res));
router.delete("/api/user/avatar", AuthMiddleware, (req, res) => usercontroller.removeAvatar(req, res));

// Plan usage of the current workspace (limits come from the workspace owner's plan)
router.get("/user/usage", AuthMiddleware, WorkspaceMiddleware, (req, res) => workspaceController.usage(req, res));
router.get("/api/user/usage", AuthMiddleware, WorkspaceMiddleware, (req, res) => workspaceController.usage(req, res));

// Workspace Routes
router.get("/workspaces", AuthMiddleware, (req, res) => workspaceController.index(req, res));
router.get("/api/workspaces", AuthMiddleware, (req, res) => workspaceController.index(req, res));

router.get("/workspaces/current", AuthMiddleware, WorkspaceMiddleware, (req, res) => workspaceController.current(req, res));
router.get("/api/workspaces/current", AuthMiddleware, WorkspaceMiddleware, (req, res) => workspaceController.current(req, res));

router.patch(
  "/workspaces/current",
  AuthMiddleware,
  WorkspaceMiddleware,
  requireWorkspaceRole("DONO", "GESTOR"),
  (req, res) => workspaceController.updateCurrent(req, res)
);
router.patch(
  "/api/workspaces/current",
  AuthMiddleware,
  WorkspaceMiddleware,
  requireWorkspaceRole("DONO", "GESTOR"),
  (req, res) => workspaceController.updateCurrent(req, res)
);

// Creator Dashboard (weekly goal, pipeline, agenda, ideas and recent performance)
router.get("/dashboard", AuthMiddleware, WorkspaceMiddleware, (req, res) => dashboardController.show(req, res));
router.get("/api/dashboard", AuthMiddleware, WorkspaceMiddleware, (req, res) => dashboardController.show(req, res));

// Team Members Routes (current workspace)
const manageTeam = requireWorkspaceRole("DONO", "GESTOR");

router.get("/membros", AuthMiddleware, WorkspaceMiddleware, (req, res) => teamController.index(req, res));
router.get("/api/membros", AuthMiddleware, WorkspaceMiddleware, (req, res) => teamController.index(req, res));

router.post("/membros/sair", AuthMiddleware, WorkspaceMiddleware, (req, res) => teamController.leave(req, res));
router.post("/api/membros/sair", AuthMiddleware, WorkspaceMiddleware, (req, res) => teamController.leave(req, res));

router.patch("/membros/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => teamController.updateRole(req, res));
router.patch("/api/membros/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => teamController.updateRole(req, res));

router.delete("/membros/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => teamController.remove(req, res));
router.delete("/api/membros/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => teamController.remove(req, res));

// Invitations Routes
// Público: a tela de aceite mostra o convite antes do login (o token de 32 bytes é o segredo)
router.get("/convites/token/:token", (req, res) => inviteController.preview(req, res));
router.get("/api/convites/token/:token", (req, res) => inviteController.preview(req, res));

// Aceitar vale para qualquer usuário logado com o e-mail do convite (sem workspace atual)
router.post("/convites/aceitar", AuthMiddleware, (req, res) => inviteController.accept(req, res));
router.post("/api/convites/aceitar", AuthMiddleware, (req, res) => inviteController.accept(req, res));

router.get("/convites", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.index(req, res));
router.get("/api/convites", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.index(req, res));

router.post("/convites", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.create(req, res));
router.post("/api/convites", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.create(req, res));

router.post("/convites/:id/reenviar", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.resend(req, res));
router.post("/api/convites/:id/reenviar", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.resend(req, res));

router.delete("/convites/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.revoke(req, res));
router.delete("/api/convites/:id", AuthMiddleware, WorkspaceMiddleware, manageTeam, (req, res) => inviteController.revoke(req, res));

// Ideas Routes (scoped to the current workspace)
router.get("/ideias", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.index(req, res));
router.get("/api/ideias", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.index(req, res));

router.get("/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.show(req, res));
router.get("/api/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.show(req, res));

router.post("/ideias", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.create(req, res));
router.post("/api/ideias", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.create(req, res));

router.patch("/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.update(req, res));
router.patch("/api/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.update(req, res));

router.delete("/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.delete(req, res));
router.delete("/api/ideias/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => ideaController.delete(req, res));

router.post("/ideias/:id/converter", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.convertIdea(req, res));
router.post("/api/ideias/:id/converter", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.convertIdea(req, res));

// Content Pipeline Routes (scoped to the current workspace)
router.get("/conteudos", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.index(req, res));
router.get("/api/conteudos", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.index(req, res));

router.get("/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.show(req, res));
router.get("/api/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.show(req, res));

router.post("/conteudos", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.create(req, res));
router.post("/api/conteudos", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.create(req, res));

router.patch("/conteudos/:id/etapa", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.updateStage(req, res));
router.patch("/api/conteudos/:id/etapa", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.updateStage(req, res));

router.patch("/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.update(req, res));
router.patch("/api/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.update(req, res));

router.delete("/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.delete(req, res));
router.delete("/api/conteudos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => contentController.delete(req, res));

// Review Routes (comments, script approval and change requests)
router.get("/conteudos/:id/comentarios", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.index(req, res));
router.get("/api/conteudos/:id/comentarios", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.index(req, res));

router.post("/conteudos/:id/comentarios", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.create(req, res));
router.post("/api/conteudos/:id/comentarios", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.create(req, res));

router.patch("/comentarios/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.update(req, res));
router.patch("/api/comentarios/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.update(req, res));

router.delete("/comentarios/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.delete(req, res));
router.delete("/api/comentarios/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.delete(req, res));

router.post("/conteudos/:id/aprovar-roteiro", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.approveScript(req, res));
router.post("/api/conteudos/:id/aprovar-roteiro", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.approveScript(req, res));

router.post("/conteudos/:id/solicitar-ajustes", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.requestChanges(req, res));
router.post("/api/conteudos/:id/solicitar-ajustes", AuthMiddleware, WorkspaceMiddleware, (req, res) => reviewController.requestChanges(req, res));

// Content Attachments Routes (MinIO "assets" bucket)
router.get("/conteudos/:id/anexos", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.index(req, res));
router.get("/api/conteudos/:id/anexos", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.index(req, res));

router.post("/conteudos/:id/anexos", AuthMiddleware, WorkspaceMiddleware, attachmentUpload, (req, res) => attachmentController.create(req, res));
router.post("/api/conteudos/:id/anexos", AuthMiddleware, WorkspaceMiddleware, attachmentUpload, (req, res) => attachmentController.create(req, res));

router.get("/anexos/:id/arquivo", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.download(req, res));
router.get("/api/anexos/:id/arquivo", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.download(req, res));

router.delete("/anexos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.delete(req, res));
router.delete("/api/anexos/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => attachmentController.delete(req, res));

// Content Metrics Routes (manual snapshots of published contents)
router.get("/metricas/resumo", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.summary(req, res));
router.get("/api/metricas/resumo", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.summary(req, res));

router.get("/conteudos/:id/metricas", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.index(req, res));
router.get("/api/conteudos/:id/metricas", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.index(req, res));

router.post("/conteudos/:id/metricas", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.create(req, res));
router.post("/api/conteudos/:id/metricas", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.create(req, res));

router.delete("/metricas/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.delete(req, res));
router.delete("/api/metricas/:id", AuthMiddleware, WorkspaceMiddleware, (req, res) => metricController.delete(req, res));

// Stripe Routes
router.get("/stripe/plans", (req, res) => stripeController.plans(req, res));
router.get("/api/stripe/plans", (req, res) => stripeController.plans(req, res));

router.post("/stripe/create-checkout-session", AuthMiddleware, (req, res) => stripeController.createCheckoutSession(req, res));
router.post("/api/stripe/create-checkout-session", AuthMiddleware, (req, res) => stripeController.createCheckoutSession(req, res));

router.post("/stripe/verify-session", AuthMiddleware, (req, res) => stripeController.verifySession(req, res));
router.post("/api/stripe/verify-session", AuthMiddleware, (req, res) => stripeController.verifySession(req, res));

router.post("/stripe/webhook", (req, res) => stripeController.webhook(req, res));
router.post("/api/stripe/webhook", (req, res) => stripeController.webhook(req, res));

router.post("/stripe/mock-upgrade", AuthMiddleware, (req, res) => stripeController.mockUpgrade(req, res));
router.post("/api/stripe/mock-upgrade", AuthMiddleware, (req, res) => stripeController.mockUpgrade(req, res));

router.post("/stripe/cancel", AuthMiddleware, (req, res) => stripeController.cancelSubscription(req, res));
router.post("/api/stripe/cancel", AuthMiddleware, (req, res) => stripeController.cancelSubscription(req, res));
