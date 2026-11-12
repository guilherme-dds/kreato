import express from "express";
import cors from "cors";
import "dotenv/config";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { authSwaggerDocument } from "./swagger.js";

const app = express();

// Atrás do nginx: req.ip passa a ser o IP real do cliente (usado no limite de tentativas)
app.set("trust proxy", 1);

app.use(express.json());
app.use(cors());

// Swagger UI Documentation
app.use("/auth/apidocs", swaggerUi.serve, swaggerUi.setup(authSwaggerDocument));
app.use("/auth/apidocs", swaggerUi.serve, swaggerUi.setup(authSwaggerDocument));
app.use("/auth/api-docs", swaggerUi.serve, swaggerUi.setup(authSwaggerDocument));
app.use("/auth/docs", swaggerUi.serve, swaggerUi.setup(authSwaggerDocument));

// JSON Endpoint for raw OpenAPI spec
app.get("/auth/openapi.json", (req, res) => {
  res.json(authSwaggerDocument);
});
app.get("/openapi.json", (req, res) => {
  res.json(authSwaggerDocument);
});

app.use(router);

const PORT = process.env.PORT || 3334;

app.listen(PORT, () => {
  console.log(`Auth Service is running on internal port ${PORT} (Swagger UI: http://localhost:${PORT}/apidocs)`);
});

