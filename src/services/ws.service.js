import { WebSocketServer } from "ws";
import { handleLegWebSocket } from "./speech.service.js";

export function createWsServer(server, NGROK_BASE, AUDIO_STREAM_PATH) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    console.log(`🔌 [UPGRADE REQUEST] URL: ${req.url} | Headers:`, req.headers);
    
    if (req.url.startsWith(AUDIO_STREAM_PATH)) {
      console.log("🌐 Upgrade → WebSocket Audio Stream");

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (req.url.startsWith('/socket.io/')) {
      // Socket.io handles its own upgrades - don't log as rejected
      return;
    } else {
      console.log(`❌ [UPGRADE REJECTED] URL does not match ${AUDIO_STREAM_PATH}`);
      socket.destroy();
    }
  });

  wss.on("connection", (ws, req) => {
    console.log(`✅ [WebSocket CONNECTED] URL: ${req.url}`);
    handleLegWebSocket(ws, req, NGROK_BASE);
  });

  console.log(`🎧 [WebSocket Server] Ready to accept connections on ${AUDIO_STREAM_PATH}`);

  return wss;
}
