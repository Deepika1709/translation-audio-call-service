import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const CONNECTION_STRING = process.env.AZURE_SIGNALR_CONNECTION_STRING;

export const HUB_NAME = process.env.SIGNALR_HUB_NAME_CALL || "call";

export const DEFAULT_TOKEN_TTL = parseInt(
  process.env.SIGNALR_TOKEN_TTL_SECONDS || "3600",
  10
);

// Parse connection string
export const parseConnectionString = (cs = CONNECTION_STRING) => {
  const parts = cs.split(";");
  const dict = {};
  parts.forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) dict[key.toLowerCase()] = value;
  });
  return dict;
};

const { endpoint, accesskey } = parseConnectionString();

// Generate client access token
export function generateClientToken(userId) {
  if (!endpoint || !accesskey) {
    throw new Error("Invalid SignalR connection string");
  }

  const audience = `${endpoint}/client/?hub=${HUB_NAME}`;
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      aud: audience,
      iss: "https://uhura-call-service",
      iat: now,
      exp: now + DEFAULT_TOKEN_TTL,
      nameid: userId,
    },
    accesskey,
    { algorithm: "HS256" }
  );
}

export { endpoint };