import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();

app.use(cors());
// O webhook do Stripe valida a assinatura sobre o corpo bruto: precisa vir antes do express.json()
app.use(["/stripe/webhook", "/api/stripe/webhook"], express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(router);

app.listen(3333, () =>
  console.log("server is running on http://localhost:3333"),
);
