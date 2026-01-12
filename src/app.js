import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";  
import "./config/redis.js";


import { connectDb } from "./config/db.config.js";
import { serviceBusSubscriber } from "./config/serviceBusSubscriber.js";
import { initializeSocketService } from "./services/socket.service.js"; 
import { createWsServer } from "./services/ws.service.js";

import eventRoutes from "./routes/events.route.js";
import callRoute from "./routes/call.route.js";  

dotenv.config();

const PORT = process.env.PORT || 8080;
const NGROK_BASE = process.env.NGROK_HOST;
const AUDIO_STREAM_PATH = "/audio-stream";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",  
    methods: ["GET", "POST"],
  },
});
initializeSocketService(io);  
initializeSocketService
app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*" }));
app.use(express.json());

app.get("/health-check"   , (_req, res) => res.send("Translation Call service is healthy and happy!"));


// routes
app.use("/call-events", eventRoutes);  
app.use("/call", callRoute);  

//  WebSocket service (for ACS *Audio Stream*)
createWsServer(server, NGROK_BASE, AUDIO_STREAM_PATH);

const start = async () => {
  try {
    await connectDb();
    await serviceBusSubscriber.initChatEventHandler();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Duplex Call service running on ${PORT}`);
      console.log(`🔗 NGROK URL: ${NGROK_BASE}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
  }
};

start();

console.log("working perfectly! 60 ");
