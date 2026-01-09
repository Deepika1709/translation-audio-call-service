import express from "express";
import dotenv from "dotenv";
import { CallAutomationClient } from "@azure/communication-call-automation";
import { getOrCreateBridge } from "../utils/bridgeHelper.js";

dotenv.config();

const router = express.Router();

const callAutomationClient = new CallAutomationClient(
  process.env.ACS_CONNECTION_STRING
);

const NGROK_BASE = process.env.NGROK_HOST;

const AUDIO_STREAM_URL = `wss://${NGROK_BASE}/audio-stream`;
const CALLBACK_URL = `https://${NGROK_BASE}/call-events`;

router.post("/join-bridge-leg", async (req, res) => {
  try {
    const { bridgeId, groupId, leg } = req.body;
    console.log(
      `🔗 join-bridge-leg | bridge=${bridgeId} leg=${leg} group=${groupId}`
    );

    if (!bridgeId || !groupId) {
      return res.status(400).json({ error: "bridgeId and groupId required" });
    }

    const legKey = leg === "B" ? "B" : "A";
    const groupCallLocator = { kind: "groupCallLocator", id: groupId };

    const transportUrl = `${AUDIO_STREAM_URL}?bridgeId=${bridgeId}&leg=${legKey}`;

    const mediaStreamingOptions = {
      transportUrl,
      transportType: "websocket",
      contentType: "audio",
      audioChannelType: "unmixed",
      audioFormat: "Pcm16KMono",
      enableBidirectional: true,
      startMediaStreaming: true,
    };

    console.log(
      `🎧 Starting ACS call connect for leg=${legKey} → ${transportUrl}`
    );

    const cognitiveServicesEndpoint = process.env.COGNITIVE_SERVICE_ENDPOINT;
    if (!cognitiveServicesEndpoint) {
      throw new Error("COGNITIVE_SERVICE_ENDPOINT not set in .env");
    }

    const result = await callAutomationClient.connectCall(
      groupCallLocator,
      CALLBACK_URL,
      {
        mediaStreamingOptions,
        callIntelligenceOptions: { cognitiveServicesEndpoint },
      }
    );

    const callConnectionId = result.callConnectionProperties.callConnectionId;
    const bridge = await getOrCreateBridge(bridgeId);

    bridge.legs[legKey].callConnectionId = callConnectionId;

    console.log(
      `✅ Bot joined leg ${legKey} in bridge ${bridgeId} | callId=${callConnectionId}`
    );
    res.json({ success: true, callConnectionId, bridgeId, leg: legKey });
  } catch (err) {
    console.error("❌ join-bridge-leg failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
