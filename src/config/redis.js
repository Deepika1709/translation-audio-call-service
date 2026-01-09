import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;

const redis = createClient({
  url: redisUrl,
  socket: {
    tls: true,              
    rejectUnauthorized: false,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("❌ Redis: Max reconnection attempts reached");
        return new Error("Max reconnection attempts reached");
      }
      const delay = Math.min(retries * 100, 3000);
      console.log(`🔄 Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
    connectTimeout: 10000,
    keepAlive: 30000
  }
});

redis.on("connect", () => {
  console.log("🔗 Redis connected");
});

redis.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

await redis.connect();

export default redis;
