import express from "express";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { backendSwaggerDocument } from "./swagger.js";
import { apiDocsEnabled, applySecurity } from "./utils/security.js";

const app = express();

applySecurity(app);

// Documentação OpenAPI (fora de produção ou com ENABLE_API_DOCS=true): Swagger UI em /api/docs e o JSON em /api/openapi.json
if (apiDocsEnabled) {
  app.get(["/openapi.json", "/api/openapi.json"], (_req, res) => {
    res.json(backendSwaggerDocument);
  });
  app.use(["/docs", "/api/docs"], swaggerUi.serve, swaggerUi.setup(backendSwaggerDocument, {
    customSiteTitle: "Kreato API - Documentação",
  }));
}

// O webhook do Stripe valida a assinatura sobre o corpo bruto: precisa vir antes do express.json()
app.use(["/stripe/webhook", "/api/stripe/webhook"], express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(router);

app.listen(3333, () =>
  console.log("server is running on http://localhost:3333"),
);
