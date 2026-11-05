import { Router } from "express";
import multer from "multer";
import { UserController } from "./controller/UserController.js";
import { StripeController } from "./controller/StripeController.js";
import { WorkspaceController } from "./controller/WorkspaceController.js";
import { IdeaController } from "./controller/IdeaController.js";
import { ContentController } from "./controller/ContentController.js";
import { AttachmentController, attachmentUpload } from "./controller/AttachmentController.js";
import { MetricController } from "./controller/MetricController.js";
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
