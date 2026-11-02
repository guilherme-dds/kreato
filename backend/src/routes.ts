import { Router } from "express";
import multer from "multer";
import { UserController } from "./controller/UserController.js";
import { StripeController } from "./controller/StripeController.js";
import { WorkspaceController } from "./controller/WorkspaceController.js";
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
