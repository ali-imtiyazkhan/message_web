import "dotenv/config";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import passport from "passport";
import { Env } from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import  connectDatabase  from "./config/database.config";
import { initializeSocket } from "./lib/socket";
import routes from "./routes";
import "./config/passport.config";

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [process.env.FRONTEND_ORIGIN || "http://localhost:5173"],
    credentials: true,
  })
);
app.use(passport.initialize());

// Health check
app.get(
  "/health",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(HTTPSTATUS.OK).json({
      message: "Server is healthy",
      status: "OK",
    });
  })
);

// API routes
app.use("/api", routes);

// Production root route
if (Env.NODE_ENV === "production") {
  app.get("/", (req: Request, res: Response) => {
    res.send("Backend API is running");
  });
}

// Global error handler
app.use(errorHandler);

// ✅ Only start server if run directly (important for build & serverless)
if (require.main === module) {
  (async () => {
    try {
      await connectDatabase();
      server.listen(Env.PORT, () => {
        console.log(
          `Server running on port ${Env.PORT} in ${Env.NODE_ENV} mode`
        );
      });
    } catch (err) {
      console.error("Database connection failed", err);
      process.exit(1);
    }
  })();
}

export default app; // export for testing or imports
