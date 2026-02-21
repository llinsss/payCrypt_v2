import { Server } from "socket.io";
import { subClient } from "../config/redis.js";
import jwt from "jsonwebtoken";

class SocketService {
  constructor() {
    this.io = null;
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(",") || ["*"],
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
        if (err) return next(new Error("Authentication error: Invalid token"));
        socket.user = decoded;
        next();
      });
    });

    this.io.on("connection", (socket) => {
      const userId = socket.user.id;
      console.log(`👤 User connected: ${userId} (${socket.id})`);
      
      // Join a private room for this user
      socket.join(`user:${userId}`);

      socket.on("disconnect", () => {
        console.log(`👤 User disconnected: ${userId} (${socket.id})`);
      });
    });

    this.setupRedisSubscription();
    
    return this.io;
  }

  async setupRedisSubscription() {
    try {
      if (!subClient.isOpen) {
        await subClient.connect();
      }

      await subClient.subscribe('transaction:updates', (message) => {
        const data = JSON.parse(message);
        console.log(`🔔 Received Redis update:`, data);

        // Emit to the specific user room
        if (data.user_id) {
          this.io.to(`user:${data.user_id}`).emit('transaction:update', data);
        }
        
        // Also emit to a global admin room if needed
        this.io.to('admin').emit('transaction:update', data);
      });

      console.log('📡 Subscribed to Redis channel: transaction:updates');
    } catch (error) {
      console.error('❌ Error setting up Redis subscription:', error);
    }
  }

  // Helper to emit events directly if needed
  emitToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }
}

export default new SocketService();
