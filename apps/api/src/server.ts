import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import morgan from "morgan";
import adminRoutes from "./routes/admin.js";
import mobileAuthRoutes from "./routes/mobileAuth.js";
import productsRoutes from "./routes/products.js";
import razorpayRoutes from "./routes/razorpay.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(morgan("dev"));
app.use("/api/webhooks/razorpay", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "seere-yaana-api" });
});

app.use("/api/payments/razorpay", razorpayRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth/mobile", mobileAuthRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    const maxBytes = Number(process.env.IMAGE_UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);
    const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return res.status(413).json({
      message: `Image is too large. Maximum allowed size is ${maxMb} MB.`
    });
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: "Unexpected server error" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
});
