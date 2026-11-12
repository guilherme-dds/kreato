import express from "express";
import "dotenv/config";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { authSwaggerDocument } from "./swagger.js";
import { apiDocsEnabled, applySecurity } from "./utils/security.js";

const app = express();

// Atrás do nginx: req.ip passa a ser o IP real do cliente (usado no limite de tentativas)
applySecurity(app);
app.use(express.json({ limit: "100kb" }));

if (apiDocsEnabled) {
  app.use(["/auth/apidocs", "/auth/api-docs", "/auth/docs"], swaggerUi.serve, swaggerUi.setup(authSwaggerDocument));
  app.get(["/auth/openapi.json", "/openapi.json"], (_req, res) => {
    res.json(authSwaggerDocument);
  });
}

app.use(router);

const PORT = process.env.PORT || 3334;

app.listen(PORT, () => {
  console.log(`Auth Service is running on internal port ${PORT}${apiDocsEnabled ? ` (Swagger UI: http://localhost:${PORT}/auth/apidocs)` : ""}`);
});

