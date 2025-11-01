import { io, Socket } from "socket.io-client";
import { create } from "zustand";

// Base backend URL depending on environment
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";


// Define Zustand store state
interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  connectSocket: () => void;
  disconnectSocket: () => void;
}

//  Zustand store for Socket.IO
export const useSocket = create<SocketState>()((set, get) => ({
  socket: null,
  onlineUsers: [],

  // Connect socket
  connectSocket: () => {
    const { socket } = get();
    if (socket?.connected) return; // already connected

    const newSocket = io(BASE_URL, {
      withCredentials: true, // send JWT cookies
      transports: ["websocket"], //  stable transport (no polling fallback)
      autoConnect: true,
      reconnection: true, //  auto reconnect
      reconnectionAttempts: 5, // retry up to 5 times
      reconnectionDelay: 2000, // wait 2s before retry
    });

    set({ socket: newSocket });

    // Socket connected
    newSocket.on("connect", () => {
      console.log(" Socket connected:", newSocket.id);
    });

    // Socket connection error
    newSocket.on("connect_error", (err) => {
      console.error(" Socket connection failed:", err.message);
    });

    // Online users update
    newSocket.on("online:users", (userIds: string[]) => {
      console.log(" Online users:", userIds);
      set({ onlineUsers: userIds });
    });

    // Disconnected
    newSocket.on("disconnect", (reason) => {
      console.warn(" Socket disconnected:", reason);
    });
  },

  // Disconnect socket
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      console.log(" Socket manually disconnected");
      set({ socket: null, onlineUsers: [] });
    }
  },
}));
