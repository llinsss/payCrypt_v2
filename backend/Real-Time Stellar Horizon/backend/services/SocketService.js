const { Server } = require('socket.io');
const Redis = require('ioredis');

let io;
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('join', (userId) => socket.join(`user:${userId}`));
    socket.on('leave', (userId) => socket.leave(`user:${userId}`));
  });

  subscriber.subscribe('balance:updates', (err) => {
    if (err) console.error('[SocketService] Redis subscribe error:', err.message);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== 'balance:updates') return;
    try {
      const { userId, balance } = JSON.parse(message);
      io.to(`user:${userId}`).emit('balance:updated', { balance });
    } catch (e) {
      console.error('[SocketService] Parse error:', e.message);
    }
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('SocketService not initialized');
  return io;
}

module.exports = { init, getIO };
