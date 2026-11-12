import { Router } from "express";
import { AuthController } from "./controller/AuthController.js";
import { ResetController } from "./controller/ResetController.js";
import { loginLimit, refreshLimit, resetConfirmLimit, resetRequestLimit, signupLimit } from "./utils/rateLimit.js";

const authController = new AuthController();
const resetController = new ResetController();

export const router = Router();

// User Registration
router.post("/create", signupLimit, (req, res) => authController.create(req, res));
router.post("/api/create", signupLimit, (req, res) => authController.create(req, res));
router.post("/auth/create", signupLimit, (req, res) => authController.create(req, res));

// Auth & Session
router.post("/auth", loginLimit, (req, res) => authController.authenticate(req, res));
router.post("/api/auth", loginLimit, (req, res) => authController.authenticate(req, res));
router.post("/auth/authenticate", loginLimit, (req, res) => authController.authenticate(req, res));
router.post("/authenticate", loginLimit, (req, res) => authController.authenticate(req, res));

router.post("/auth/refresh", refreshLimit, (req, res) => authController.refresh(req, res));
router.post("/api/auth/refresh", refreshLimit, (req, res) => authController.refresh(req, res));
router.post("/refresh", refreshLimit, (req, res) => authController.refresh(req, res));

router.post("/auth/logout", (req, res) => authController.logout(req, res));
router.post("/api/auth/logout", (req, res) => authController.logout(req, res));
router.post("/logout", (req, res) => authController.logout(req, res));

router.post("/auth/verify", (req, res) => authController.verify(req, res));
router.post("/api/auth/verify", (req, res) => authController.verify(req, res));
router.post("/verify", (req, res) => authController.verify(req, res));

// Password Reset
router.post("/auth/reset", resetRequestLimit, (req, res) => resetController.reset(req, res));
router.post("/api/auth/reset", resetRequestLimit, (req, res) => resetController.reset(req, res));
router.post("/reset", resetRequestLimit, (req, res) => resetController.reset(req, res));

router.post("/auth/reset/confirm", resetConfirmLimit, (req, res) => resetController.confirm(req, res));
router.post("/api/auth/reset/confirm", resetConfirmLimit, (req, res) => resetController.confirm(req, res));
router.post("/reset/confirm", resetConfirmLimit, (req, res) => resetController.confirm(req, res));

