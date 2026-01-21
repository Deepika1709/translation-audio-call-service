import { CommunicationIdentityClient } from "@azure/communication-identity";
import { CallAutomationClient } from "@azure/communication-call-automation";
import { User } from "../models/User.model.js"; // Import your User model
import { getOrCreateBridge, updateBridge } from "../utils/bridgeHelper.js";
import dotenv from "dotenv";
import { getBridge } from "../utils/RedisBridgeStore.js";

dotenv.config();

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const NGROK_BASE = process.env.NGROK_HOST;
const COGNITIVE_SERVICE_ENDPOINT = process.env.COGNITIVE_SERVICE_ENDPOINT;

const identityClient = new CommunicationIdentityClient(ACS_CONNECTION_STRING);
const callAutomationClient = new CallAutomationClient(ACS_CONNECTION_STRING);

const AUDIO_STREAM_URL = `wss://${NGROK_BASE}/audio-stream`;
const CALLBACK_URL = `https://${NGROK_BASE}/call-events`;

export async function getOrCreateAcsUser(userId) {
  try {
    const userDoc = await User.findOne({ userId: userId });

    if (!userDoc) {
      throw new Error(`User not found with userId: ${userId}`);
    }

    if (userDoc.acsUserId) {
      console.log(`👤 Found existing ACS user: ${userDoc.acsUserId}`);
      const tokenResponse = await identityClient.getToken(
        { communicationUserId: userDoc.acsUserId },
        ["voip"]
      );
      return {
        acsUserId: userDoc.acsUserId,
        token: tokenResponse.token,
        expiresOn: tokenResponse.expiresOn,
      };
    }

    console.log(`👤 Crawaiteating new ACS user for ${userId}...`);
    const acsUser = await identityClient.createUser();
    const tokenResponse = await identityClient.getToken(acsUser, ["voip"]);

    userDoc.acsUserId = acsUser.communicationUserId;
    await userDoc.save();

    console.log(`✅ New ACS user created: ${acsUser.communicationUserId}`);

    return {
      acsUserId: acsUser.communicationUserId,
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOn,
    };
  } catch (err) {
    console.error("❌ Failed in getOrCreateAcsUser:", err);
    throw err;
  }
}

export async function connectBotToBridgeLeg({ bridgeId, groupId, leg, callType = 'audio' }) {
  try {
    console.log(
      `🔗 Connecting bot to bridge=${bridgeId} leg=${leg} group=${groupId} callType=${callType}`
    );

    // ✅ Separate group architecture - each leg has unmixed audio
    const legKey = leg === "B" ? "B" : "A";
    const groupCallLocator = { kind: "groupCallLocator", id: groupId };
    const transportUrl = `${AUDIO_STREAM_URL}?bridgeId=${bridgeId}&leg=${legKey}`;

    console.log(`🔊 [Media Streaming] Transport URL: ${transportUrl}`);

    const mediaStreamingOptions = {
      transportUrl,
      transportType: "websocket",
      contentType: callType === 'video' ? 'audio' : 'audio', // ⚠️ Keep as audio for now - video transcription not supported
      audioChannelType: "unmixed", // ✅ Unmixed - only one user per group!
      audioFormat: "Pcm16KMono",
      enableBidirectional: true,
      startMediaStreaming: true,
    };

    console.log(`📡 [Media Streaming Options]:`, JSON.stringify(mediaStreamingOptions, null, 2));

    if (!COGNITIVE_SERVICE_ENDPOINT) {
      throw new Error("COGNITIVE_SERVICE_ENDPOINT not set in .env");
    }

    const result = await callAutomationClient.connectCall(
      groupCallLocator,
      CALLBACK_URL,
      {
        mediaStreamingOptions,
        callIntelligenceOptions: {
          cognitiveServicesEndpoint: COGNITIVE_SERVICE_ENDPOINT,
        },
      }
    );

    const callConnectionId = result.callConnectionProperties.callConnectionId;
    const callState = result.callConnectionProperties.callConnectionState;
    
    console.log(`📞 [Bot Connection Result for leg ${legKey}]:`, {
      callConnectionId,
      callState,
      groupId,
      transportUrl: mediaStreamingOptions.transportUrl,
      bidirectionalEnabled: mediaStreamingOptions.enableBidirectional,
      initialStreamingFlag: mediaStreamingOptions.startMediaStreaming
    });

    const bridge = await getOrCreateBridge(bridgeId);

    // Store callConnectionId for this specific leg
    bridge.legs[legKey].callConnectionId = callConnectionId;

    await updateBridge(bridge);

    console.log(
      `✅ Bot joined leg ${legKey} in bridge ${bridgeId} | callId=${callConnectionId} | state=${callState}`
    );
    
    // 🔥 Media streaming will start automatically due to startMediaStreaming: true in options
    // Azure will initiate WebSocket upgrade request when call is connected
    console.log(`⏳ [Leg ${legKey}] Media streaming will start automatically when call connects`);

    return { success: true, callConnectionId, bridgeId, leg: legKey };
  } catch (err) {
    console.error("❌ connectBotToBridgeLeg failed:", err);
    throw err;
  }
}
