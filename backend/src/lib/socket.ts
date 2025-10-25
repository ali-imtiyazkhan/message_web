import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";
import { Env } from "../config/env.config";
import { validateChatParticipant } from "../services/chat.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: Server | null = null;

// Multi-tab support: store array of socket IDs per user
const onlineUsers = new Map<string, string[]>();

export const initializeSocket = (httpServer: HTTPServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: Env.FRONTEND_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // 🔐 Authenticate socket
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      if (!rawCookie) return next(new Error("Unauthorized"));

      // Extract token from cookie
      const match = rawCookie.match(/accessToken=([^;]+)/);
      const token = match ? match[1] : null;

      if (!token) return next(new Error("Unauthorized"));

      const decodedToken = jwt.verify(token, Env.JWT_SECRET) as { userId: string };
      if (!decodedToken?.userId) return next(new Error("Unauthorized"));

      socket.userId = decodedToken.userId.toString();
      next();
    } catch (error) {
      console.error("Socket auth error:", error);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const socketId = socket.id;

    // Register socket for multi-tab users
    const existingSockets = onlineUsers.get(userId) || [];
    existingSockets.push(socketId);
    onlineUsers.set(userId, existingSockets);

    console.log(`✅ User connected: ${userId} (socket: ${socketId})`);
    console.log("🟢 Current online users:", Object.fromEntries(onlineUsers));

    // Broadcast online users
    io?.emit("online:users", Array.from(onlineUsers.keys()));

    // Create personal room
    socket.join(`user:${userId}`);

    // Join chat room
    socket.on("chat:join", async (chatId: string, callback?: (err?: string) => void) => {
      try {
        await validateChatParticipant(chatId, userId);
        socket.join(`chat:${chatId}`);
        console.log(`User ${userId} joined chat:${chatId}`);
        callback?.();
      } catch (error) {
        console.error(`Error joining chat ${chatId}:`, error);
        callback?.("Error joining chat");
      }
    });

    // Leave chat room
    socket.on("chat:leave", (chatId: string) => {
      if (chatId) {
        socket.leave(`chat:${chatId}`);
        console.log(`User ${userId} left chat:${chatId}`);
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId) || [];
      const filtered = sockets.filter((id) => id !== socketId);
      if (filtered.length > 0) {
        onlineUsers.set(userId, filtered);
      } else {
        onlineUsers.delete(userId);
      }

      io?.emit("online:users", Array.from(onlineUsers.keys()));
      console.log(`🔴 User disconnected: ${userId} (socket: ${socketId})`);
      console.log("🟢 Current online users:", Object.fromEntries(onlineUsers));
    });
  });
};

// Get Socket.IO instance
function getIO() {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

// Emit new chat to participants
export const emitNewChatToParticpants = (participantIds: string[] = [], chat: any) => {
  const io = getIO();
  for (const participantId of participantIds) {
    io.to(`user:${participantId}`).emit("chat:new", chat);
  }
};

// Emit new message to chat room
export const emitNewMessageToChatRoom = (senderId: string, chatId: string, message: any) => {
  const io = getIO();
  const senderSocketIds = onlineUsers.get(senderId) || [];

  console.log("SenderId:", senderId);
  console.log("Sender socketIds:", senderSocketIds);
  console.log("All online users:", Object.fromEntries(onlineUsers));

  if (senderSocketIds.length > 0) {
    io.to(`chat:${chatId}`).except(senderSocketIds).emit("message:new", message);
  } else {
    io.to(`chat:${chatId}`).emit("message:new", message);
  }
};

// Emit last message update to participants
export const emitLastMessageToParticipants = (participantIds: string[], chatId: string, lastMessage: any) => {
  const io = getIO();
  const payload = { chatId, lastMessage };
  for (const participantId of participantIds) {
    io.to(`user:${participantId}`).emit("chat:update", payload);
  }
};
