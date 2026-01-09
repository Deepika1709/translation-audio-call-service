import { Server } from "socket.io";

let io;

export function initializeSocketService(ioInstance) {
  io = ioInstance;

  io.on("connection", (socket) => {
    console.log('\\n' + '='.repeat(80));
    console.log(`🔌 SOCKET CONNECTED: ${socket.id}`);
    console.log('='.repeat(80));
    console.log(`🌍 Remote Address: ${socket.handshake.address}`);
    console.log(`🔑 Auth Token Exists: ${!!socket.handshake.auth?.token}`);
    console.log(`🕐 Connected At: ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\\n');
    

    socket.on("join_user_room", (userId) => {
      if (!userId) {
        console.log(`⚠️ Socket ${socket.id} attempted to join without userId`);
        return;
      }
      console.log('\\n' + '🚪'.repeat(40));
      console.log(`🚪 USER JOINED ROOM`);
      console.log('🚪'.repeat(40));
      console.log(`🆔 User ID: ${userId}`);
      console.log(`🔌 Socket ID: ${socket.id}`);
      console.log(`👥 Room Size Before: ${io.sockets.adapter.rooms.get(userId)?.size || 0}`);
      socket.join(userId);
      console.log(`✅ Room Size After: ${io.sockets.adapter.rooms.get(userId)?.size || 0}`);
      console.log('🚪'.repeat(40) + '\\n');
    });

    socket.on("disconnect", () => {
      console.log('\\n' + '🔴'.repeat(40));
      console.log(`🔴 SOCKET DISCONNECTED: ${socket.id}`);
      console.log('🔴'.repeat(40));
      console.log(`🕐 Disconnected At: ${new Date().toISOString()}`);
      console.log('🔴'.repeat(40) + '\\n');
    });
  });
}

// returns the initialized Socket.io instance.
export function getIoInstance() {
  if (!io) {
    throw new Error(
      "Socket.io has not been initialized. Call initializeSocketService first."
    );
  }
  return io;
}



// socket io - open for once 
// singal - rest api  