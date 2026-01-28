// import express from "express"
// import dotenv from "dotenv"
// import { BRIDGES } from "../utils/bridgeHelper.js";

// dotenv.config()

// const router = express.Router()

// router.post("/", (req, res) => {
//   const events = req.body || [];
//   console.log(`📬 Received ${events.length} call-events`);
//   for (const e of events) {
//     const { type, data } = e;
//     console.log(`📡 Event: ${type}`);

//     if (type === "Microsoft.Communication.ParticipantsUpdated") {
//       console.log("👥 Participants updated");

//       const callId = data.callConnectionId;
//       for (const [bridgeId, bridge] of BRIDGES) {
//         for (const legKey of ["A", "B"]) {
//           if (bridge.legs[legKey].callConnectionId === callId) {
//             bridge.legs[legKey].participants = (data.participants || []).map(
//               (p) => ({
//                 rawId: p.identifier?.rawId,
//                 commId: p.identifier?.communicationUser?.id,
//               })
//             );
//             console.log(`✅ Updated participants for ${bridgeId}/${legKey}`);
//           }
//         }
//       }
//     }
//   }
//   res.sendStatus(200);
// });

// export default router;

import express from "express";
import dotenv from "dotenv";
import { CallAutomationClient } from "@azure/communication-call-automation";

import redis from "../config/redis.js";

import { getOrCreateBridge, updateBridge } from "../utils/bridgeHelper.js";
import { reinitializePendingLeg } from "../services/speech.service.js";

dotenv.config();

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const callAutomationClient = new CallAutomationClient(ACS_CONNECTION_STRING);

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const events = req.body || [];
    console.log(`📬 Received ${events.length} call-events`);

    for (const e of events) {
      const { type, data } = e;
      console.log("dataaaaaaaaaaaa🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯",data);
      
      console.log(`📡 Event: ${type}`);

      // =========================================================
      //  CALL CONNECTED EVENT
      // =========================================================
      if (type === "Microsoft.Communication.CallConnected") {
        console.log("✅ Call connected:", data.callConnectionId);
        console.log("   Media streaming will start automatically (startMediaStreaming: true)");
        
        // Trigger recognizer initialization for both legs
        const callId = data.callConnectionId;
        const bridgeIds = await redis.keys("BRIDGE:*");
        for (const key of bridgeIds) {
          const bridgeId = key.split(":")[1];
          const bridge = await getOrCreateBridge(bridgeId);
          if (bridge?.legs?.A?.callConnectionId === callId) {
            console.log(`🔄 Triggered initialization of recognizers for bridge ${bridgeId}`);
            setTimeout(() => {
              reinitializePendingLeg(bridgeId, "A");
              reinitializePendingLeg(bridgeId, "B");
            }, 1000);
            break;
          }
        }
      }

      // =========================================================
      //  MEDIA STREAMING STARTED EVENT
      // =========================================================
      if (type === "Microsoft.Communication.MediaStreamingStarted") {
        console.log("🎉 MEDIA STREAMING STARTED EVENT RECEIVED!");
        console.log("   Call ID:", data.callConnectionId);
        console.log("   Media Streaming ID:", data.mediaStreamingUpdate?.mediaStreamingId);
        console.log("   Content Type:", data.mediaStreamingUpdate?.contentType);
        console.log("   Azure should now initiate WebSocket upgrade request to transportUrl");
      }
      
      // =========================================================
      //  MEDIA STREAMING FAILED EVENT
      // =========================================================
      if (type === "Microsoft.Communication.MediaStreamingFailed") {
        console.error("❌ Media streaming failed:", data);
      }

      // =========================================================
      //  PARTICIPANTS UPDATED EVENT
      // =========================================================
      if (type === "Microsoft.Communication.ParticipantsUpdated") {
        console.log("👥 Participants updated");

        const callId = data.callConnectionId;

        // We don't know the bridgeId directly so use convention:
        // Every callConnectionId belongs to a leg (A or B)
        //
        // ---> We scan bridges inside Redis.
        // ---> Optimized: just pull bridgeId from metadata stored
        //                 with the leg.
        //
        // For now: fetch all bridges (not many in real systems).
        const bridgeIds = await redis.keys("BRIDGE:*");

        for (const key of bridgeIds) {
          const bridgeId = key.split(":")[1];
          
          // Skip if bridgeId is undefined/null
          if (!bridgeId) {
            console.warn(`⚠️ Invalid bridge key: ${key}`);
            continue;
          }

          let bridge = await getOrCreateBridge(bridgeId);
          if (!bridge) {
            console.warn(`⚠️ Bridge ${bridgeId} not found in store`);
            continue;
          }

          // Ensure legs object exists
          if (!bridge.legs) {
            console.warn(`⚠️ Bridge ${bridgeId} has no legs yet - skipping participant update`);
            continue;
          }

          let updated = false;

          for (const legKey of ["A", "B"]) {
            // Check leg exists before reading callConnectionId
            const leg = bridge.legs[legKey];
            if (!leg) {
              console.warn(`⚠️ Bridge ${bridgeId} missing leg ${legKey}`);
              continue;
            }

            if (leg.callConnectionId === callId) {
              leg.participants = (data.participants || []).map((p) => ({
                rawId: p.identifier?.rawId,
                commId: p.identifier?.communicationUser?.id,
              }));

              console.log(`✅ Updated participants for ${bridgeId}/${legKey}`);
              updated = true;
            }
          }

          if (updated) {
            await updateBridge(bridge);
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error handling call-events:", err);
    return res.sendStatus(500);
  }
});

export default router;
