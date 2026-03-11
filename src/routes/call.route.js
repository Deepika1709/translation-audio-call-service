import express from "express";
import { v4 as uuidv4 } from "uuid";
import {
  getOrCreateAcsUser,
  connectBotToBridgeLeg,
} from "../services/call.service.js";
import { getIoInstance } from "../services/socket.service.js";
import {
  getOrCreateBridge,
  removeBridge,
  updateBridge,
} from "../utils/bridgeHelper.js";
import { User } from "../models/User.model.js";
import { Call } from "../models/Call.model.js";
import { reinitializePendingLeg } from "../services/speech.service.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { saveBridge } from "../utils/RedisBridgeStore.js";
// import { sendCallNotification } from "../services/pushNotificationService.js";

const router = express.Router();

router.post("/initiate", authenticateToken, async (req, res) => {
  const callerUserId = req.user.userId;

  console.log("CALL JAA RHI H !!!!!!", callerUserId);
  

  try {
    const { calleeUserId, callerLanguage, callType = 'audio' } = req.body;

    // 🔍 CRITICAL: Log all incoming data for debugging
    console.log('═══════════════════════════════════════════════════');
    console.log('📥 [/call/initiate] Incoming Request:');
    console.log('  Caller User ID:', callerUserId);
    console.log('  Callee User ID:', calleeUserId);
    console.log('  Caller Language:', callerLanguage);
    console.log('  Call Type:', callType);
    console.log('  Language Type:', typeof callerLanguage);
    console.log('  Full Request Body:', JSON.stringify(req.body, null, 2));
    console.log('═══════════════════════════════════════════════════');

    if (!callerUserId || !calleeUserId) {
      return res
        .status(400)
        .json({ error: "callerUserId and calleeUserId are required" });
    }

    if (!callerLanguage) {
      console.error('❌ Missing callerLanguage in request body');
      return res.status(400).json({ error: "callerLanguage is required" });
    }

    // Validate language code format (should be like 'en-US', 'hi-IN')
    const languageRegex = /^[a-z]{2,3}-[A-Z]{2}$/;
    if (!languageRegex.test(callerLanguage)) {
      console.error(`❌ Invalid language code format: "${callerLanguage}"`);
      return res.status(400).json({ 
        error: `Invalid language code format: "${callerLanguage}". Expected format: xx-XX (e.g., en-US, hi-IN)` 
      });
    }

    const callerUser = await User.findOne({ userId: callerUserId });
    if (!callerUser) {
      return res.status(404).json({ error: "Caller not found" });
    }

    const calleeUser = await User.findOne({ userId: calleeUserId });
    if (!calleeUser) {
      return res.status(404).json({ error: "Callee not found" });
    }

    const acsUser = await getOrCreateAcsUser(callerUserId);

    const bridgeId = uuidv4();
    const callId = uuidv4();
    const groupIdA = uuidv4(); // ✅ Separate audio group for User A (caller) - for translation
    const videoGroupId = callType === 'video' ? uuidv4() : null; // ✅ Shared video group for both users

    // Load or create a bridge in Redis
    const bridge = await getOrCreateBridge(
      bridgeId,
      callerUserId,
      calleeUserId
    );

    // Store language, call ID, and ACS user ID
    bridge.legs.A.language = callerLanguage;
    bridge.legs.A.userId = callerUserId;
    bridge.legs.A.acsUserId = acsUser.acsUserId;
    bridge.legs.A.groupId = groupIdA; // ✅ Audio-only group for translation
    bridge.callId = callId;
    bridge.videoGroupId = videoGroupId; // ✅ Store shared video group ID

    // 🔥 Persist changes to Redis
    await updateBridge(bridge);

    const callRecord = await Call.create({
      callId: callId,
      bridgeId: bridgeId,
      callType: callType, // 🎥 Support both audio and video
      caller: {
        userId: callerUserId,
        language: callerLanguage,
        acsUserId: acsUser.acsUserId,
        groupId: groupIdA, // ✅ Audio group for caller (translation)
      },
      callee: {
        userId: calleeUserId,
      },
      status: "initiated",
      initiatedAt: new Date(),
      metadata: {
        videoGroupId: videoGroupId, // ✅ Store shared video group in metadata
      },
    });

    // ⏳ DON'T connect bot yet - wait for callee to accept so we have both languages
    // Bot will join in /accept endpoint after both languages are known

    // Notify Callee via socket
    const io = getIoInstance();
    const roomSize = io.sockets.adapter.rooms.get(calleeUserId)?.size || 0;
    
    console.log(`📞 [INCOMING_CALL] Emitting to callee: ${calleeUserId}`);
    console.log(`   Room size: ${roomSize} (0 means user not connected)`);
    console.log(`   Event data:`, {
      callId: callId,
      bridgeId: bridgeId,
      callerUserId: callerUserId,
      callerName: `${callerUser.firstName} ${callerUser.lastName}`,
      callerLanguage: callerLanguage,
    });
    
    io.to(calleeUserId).emit("incoming_call", {
      callId: callId,
      bridgeId: bridgeId,
      callerUserId: callerUserId,
      callerName: `${callerUser.firstName} ${callerUser.lastName}`,
      callerLanguage: callerLanguage,
      callType: callType, // 🎥 Include call type for receiver
      videoGroupId: videoGroupId, // ✅ Send shared video group to callee
    });

    // ---------------------------------------------------------
    // 📲 SEND PUSH NOTIFICATION (WORKS IN ALL STATES)
    // ---------------------------------------------------------
    // try {
    //   await sendCallNotification(callerUserId, calleeUserId, {
    //     title: `Incoming Translation ${callType === 'video' ? 'Video' : 'Audio'} Call`,
    //     body: `${callerUser.firstName} ${callerUser.lastName} is calling you with translation`,
    //     data: {
    //       callId: callId,
    //       bridgeId: bridgeId,
    //       callerUserId: callerUserId,
    //       callerName: `${callerUser.firstName} ${callerUser.lastName}`,
    //       callerProfilePic: callerUser.profilePicUrl || '',
    //       callerLanguage: callerLanguage,
    //       callType: callType,
    //       videoGroupId: videoGroupId || '',
    //       groupId: groupIdA,
    //       notificationType: 'incoming_translation_call',
    //       isTranslationCall: true,
    //     },
    //   }, {
    //     mode: 'kill', // This ensures notification works in all states
    //     callType: callType,
    //     apnsTopic: 'com.uhura.app',
    //   });
    //   console.log(`✅ [PUSH] Translation call notification sent successfully`);
    // } catch (pushError) {
    //   console.error('❌ [PUSH] Failed to send translation call notification:', pushError);
    //   // Don't fail the call if push notification fails
    // }

    console.log(
      `📞 Call initiated. CallID: ${callId}, Bridge: ${bridgeId}, Caller: ${callerUserId}, Language: ${callerLanguage}, CallType: ${callType}, VideoGroup: ${videoGroupId || 'N/A'}`
    );

    return res.json({
      callId: callId,
      acsUser,
      bridgeId,
      groupId: groupIdA, // ✅ Return caller's audio group for translation
      videoGroupId: videoGroupId, // ✅ Return shared video group ID
      leg: "A",
      callerLanguage: callerLanguage,
      callType: callType,
    });
  } catch (err) {
    console.error("❌ /call/initiate failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// after connecting bot to Leg B
router.post("/accept", authenticateToken, async (req, res) => {
  const calleeUserId = req.user.userId;


  console.log("CALL UTHAAAAA LIIIII !!!!!!", calleeUserId);




  try {
    const { bridgeId, calleeLanguage } = req.body;

    // 🔍 CRITICAL: Log all incoming data for debugging
    console.log('═══════════════════════════════════════════════════');
    console.log('📥 [/call/accept] Incoming Request:');
    console.log('  Callee User ID:', calleeUserId);
    console.log('  Bridge ID:', bridgeId);
    console.log('  Callee Language:', calleeLanguage);
    console.log('  Language Type:', typeof calleeLanguage);
    console.log('  Full Request Body:', JSON.stringify(req.body, null, 2));
    console.log('═══════════════════════════════════════════════════');

    if (!calleeUserId || !bridgeId) {
      return res
        .status(400)
        .json({ error: "calleeUserId and bridgeId are required" });
    }

    if (!calleeLanguage) {
      console.error('❌ Missing calleeLanguage in request body');
      return res.status(400).json({ error: "calleeLanguage is required" });
    }

    // Validate language code format
    const languageRegex = /^[a-z]{2,3}-[A-Z]{2}$/;
    if (!languageRegex.test(calleeLanguage)) {
      console.error(`❌ Invalid language code format: "${calleeLanguage}"`);
      return res.status(400).json({ 
        error: `Invalid language code format: "${calleeLanguage}". Expected format: xx-XX (e.g., en-US, hi-IN)` 
      });
    }

    const calleeUser = await User.findOne({ userId: calleeUserId });
    if (!calleeUser) {
      return res.status(404).json({ error: "Callee not found" });
    }

    const bridge = await getOrCreateBridge(bridgeId);
    if (!bridge.legs.A.language) {
      return res
        .status(400)
        .json({ error: "Caller language not set in bridge" });
    }

    const callRecord = await Call.findOne({ bridgeId: bridgeId });
    if (!callRecord) {
      return res.status(404).json({ error: "Call record not found" });
    }

    const acsUser = await getOrCreateAcsUser(calleeUserId);
    const groupIdB = uuidv4(); // ✅ Separate audio group for User B (callee) - for translation

    // Store callee's language and ACS user ID in bridge
    bridge.legs.B.language = calleeLanguage;
    bridge.legs.B.userId = calleeUserId;
    bridge.legs.B.acsUserId = acsUser.acsUserId;
    bridge.legs.B.groupId = groupIdB; // ✅ Audio-only group for translation

    await updateBridge(bridge);

    // Update call record
    callRecord.callee.language = calleeLanguage;
    callRecord.callee.acsUserId = acsUser.acsUserId;
    callRecord.callee.groupId = groupIdB; // ✅ Audio group for callee (translation)
    callRecord.status = "accepted";
    callRecord.acceptedAt = new Date();
    await callRecord.save();

    // Get shared video group ID and call type
    const videoGroupId = bridge.videoGroupId;
    const callType = callRecord.callType;

    // ✅ Connect bot to BOTH separate audio groups for translation
    const groupIdA = bridge.legs.A.groupId;
    
    console.log(`🤖 [ACCEPT] Connecting bot to TWO separate AUDIO groups for translation:`);
    console.log(`  - Audio Group A (${bridge.legs.A.language}): ${groupIdA}`);
    console.log(`  - Audio Group B (${bridge.legs.B.language}): ${groupIdB}`);
    if (callType === 'video') {
      console.log(`  - Shared Video Group (for peer-to-peer video): ${videoGroupId}`);
    }
    
    try {
      // Connect to Leg A (caller's audio group for translation)
      await connectBotToBridgeLeg({
        bridgeId: bridgeId,
        groupId: groupIdA,
        leg: "A", // Bot joins caller's private audio group
        callType: callType,
      });
      console.log(`✅ [ACCEPT] Bot connected to Leg A audio group ${groupIdA}`);
      
      // Connect to Leg B (callee's audio group for translation)
      await connectBotToBridgeLeg({
        bridgeId: bridgeId,
        groupId: groupIdB,
        leg: "B", // Bot joins callee's private audio group
        callType: callType,
      });
      console.log(`✅ [ACCEPT] Bot connected to Leg B audio group ${groupIdB}`);
    } catch (botError) {
      console.error(`❌ [ACCEPT] Bot connection failed for bridge ${bridgeId}:`, botError);
      throw botError;
    }

    // Initialize the speech recognizers (one per leg)
    setTimeout(() => {
      reinitializePendingLeg(bridgeId, "A");
      reinitializePendingLeg(bridgeId, "B");
      console.log(
        `🔄 Triggered initialization of recognizers for bridge ${bridgeId}`
      );
    }, 1000);

    // Emit socket event back to the CALLER
    if (bridge.callerUserId) {
      const io = getIoInstance();
      io.to(bridge.callerUserId).emit("call_accepted", {
        callId: callRecord.callId,
        bridgeId: bridgeId,
        calleeUserId: calleeUserId,
        calleeName: `${calleeUser.firstName} ${calleeUser.lastName}`,
        calleeLanguage: calleeLanguage,
        videoGroupId: videoGroupId, // ✅ Send shared video group to caller
      });

      // ---------------------------------------------------------
      // 📲 SEND PUSH NOTIFICATION TO CALLER (CALL ACCEPTED)
      // ---------------------------------------------------------
      // try {
      //   await sendCallNotification(calleeUserId, bridge.callerUserId, {
      //     title: 'Call Accepted',
      //     body: `${calleeUser.firstName} ${calleeUser.lastName} accepted your translation call`,
      //     data: {
      //       callId: callRecord.callId,
      //       bridgeId: bridgeId,
      //       calleeUserId: calleeUserId,
      //       calleeName: `${calleeUser.firstName} ${calleeUser.lastName}`,
      //       calleeLanguage: calleeLanguage,
      //       videoGroupId: videoGroupId || '',
      //       notificationType: 'translation_call_accepted',
      //       isTranslationCall: true,
      //     },
      //   }, {
      //     mode: 'kill',
      //     callType: callType,
      //     apnsTopic: 'com.uhura.app',
      //   });
      //   console.log(`✅ [PUSH] Call accepted notification sent to caller`);
      // } catch (pushError) {
      //   console.error('❌ [PUSH] Failed to send call accepted notification:', pushError);
      // }
    }

    console.log(
      `✅ Call accepted. CallID: ${callRecord.callId}, Bridge: ${bridgeId}, Callee: ${calleeUserId}, Language: ${calleeLanguage}, CallType: ${callType}, VideoGroup: ${videoGroupId || 'N/A'}`
    );

    res.json({
      callId: callRecord.callId,
      acsUser,
      bridgeId,
      groupId: groupIdB, // ✅ Return callee's audio group for translation
      videoGroupId: videoGroupId, // ✅ Return shared video group ID
      leg: "B",
      callerLanguage: bridge.legs.A.language,
      calleeLanguage: calleeLanguage,
      callType: callType,
    });
  } catch (err) {
    console.error("❌ /call/accept failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reject", authenticateToken, async (req, res) => {
  const calleeUserId = req.user.userId;

  try {
    const { bridgeId } = req.body;

    if (!calleeUserId || !bridgeId) {
      return res
        .status(400)
        .json({ error: "calleeUserId and bridgeId are required" });
    }

    const callRecord = await Call.findOne({ bridgeId: bridgeId });
    if (!callRecord) {
      return res.status(404).json({ error: "Call record not found" });
    }

    callRecord.status = "rejected";
    callRecord.rejectedAt = new Date();
    callRecord.rejectedBy = calleeUserId;
    callRecord.endedAt = new Date();
    await callRecord.save();

    const bridge = await getOrCreateBridge(bridgeId);
    if (bridge.callerUserId) {
      const io = getIoInstance();
      io.to(bridge.callerUserId).emit("call_rejected", {
        callId: callRecord.callId,
        bridgeId: bridgeId,
        rejectedBy: calleeUserId,
      });

      // ---------------------------------------------------------
      // 📲 SEND PUSH NOTIFICATION TO CALLER (CALL REJECTED)
      // ---------------------------------------------------------
      // try {
      //   const calleeUser = await User.findOne({ userId: calleeUserId });
      //   await sendCallNotification(calleeUserId, bridge.callerUserId, {
      //     title: 'Call Rejected',
      //     body: `${calleeUser?.firstName || 'User'} ${calleeUser?.lastName || ''} rejected your translation call`,
      //     data: {
      //       callId: callRecord.callId,
      //       bridgeId: bridgeId,
      //       rejectedBy: calleeUserId,
      //       notificationType: 'translation_call_rejected',
      //       isTranslationCall: true,
      //     },
      //   }, {
      //     mode: 'kill',
      //     callType: callRecord.callType || 'audio',
      //     apnsTopic: 'com.uhura.app',
      //   });
      //   console.log(`✅ [PUSH] Call rejected notification sent to caller`);
      // } catch (pushError) {
      //   console.error('❌ [PUSH] Failed to send call rejected notification:', pushError);
      // }
    }

    removeBridge(bridgeId);

    console.log(
      `❌ Call rejected. CallID: ${callRecord.callId}, Bridge: ${bridgeId}, Rejected by: ${calleeUserId}`
    );

    res.json({
      success: true,
      message: "Call rejected",
      callId: callRecord.callId,
    });
  } catch (err) {
    console.error("❌ /call/reject failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/cancel", authenticateToken, async (req, res) => {
  const callerUserId = req.user.userId;
  try {
    const { bridgeId } = req.body;

    if (!callerUserId || !bridgeId) {
      return res
        .status(400)
        .json({ error: "callerUserId and bridgeId are required" });
    }

    const callRecord = await Call.findOne({ bridgeId: bridgeId });
    if (!callRecord) {
      return res.status(404).json({ error: "Call record not found" });
    }

    callRecord.status = "cancelled";
    callRecord.endedAt = new Date();
    callRecord.endedBy = "caller";
    await callRecord.save();

    const bridge = await getOrCreateBridge(bridgeId);
    if (bridge.calleeUserId) {
      const io = getIoInstance();
      io.to(bridge.calleeUserId).emit("call_cancelled", {
        callId: callRecord.callId,
        bridgeId: bridgeId,
        cancelledBy: callerUserId,
      });

      // ---------------------------------------------------------
      // 📲 SEND PUSH NOTIFICATION TO CALLEE (CALL CANCELLED)
      // ---------------------------------------------------------
      // try {
      //   const callerUser = await User.findOne({ userId: callerUserId });
      //   await sendCallNotification(callerUserId, bridge.calleeUserId, {
      //     title: 'Call Cancelled',
      //     body: `${callerUser?.firstName || 'User'} ${callerUser?.lastName || ''} cancelled the translation call`,
      //     data: {
      //       callId: callRecord.callId,
      //       bridgeId: bridgeId,
      //       cancelledBy: callerUserId,
      //       notificationType: 'translation_call_cancelled',
      //       isTranslationCall: true,
      //     },
      //   }, {
      //     mode: 'kill',
      //     callType: callRecord.callType || 'audio',
      //     apnsTopic: 'com.uhura.app',
      //   });
      //   console.log(`✅ [PUSH] Call cancelled notification sent to callee`);
      // } catch (pushError) {
      //   console.error('❌ [PUSH] Failed to send call cancelled notification:', pushError);
      // }
    }

    removeBridge(bridgeId);

    console.log(
      `🚫 Call cancelled. CallID: ${callRecord.callId}, Bridge: ${bridgeId}, Cancelled by: ${callerUserId}`
    );

    res.json({
      success: true,
      message: "Call cancelled",
      callId: callRecord.callId,
    });
  } catch (err) {
    console.error("❌ /call/cancel failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/end", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { bridgeId } = req.body;

    if (!userId || !bridgeId) {
      return res
        .status(400)
        .json({ error: "userId and bridgeId are required" });
    }

    const callRecord = await Call.findOne({ bridgeId: bridgeId });
    if (!callRecord) {
      return res.status(404).json({ error: "Call record not found" });
    }

    if (callRecord.status !== "accepted") {
      return res.status(400).json({ error: "Call is not in active state" });
    }

    const endedBy = userId === callRecord.caller.userId ? "caller" : "callee";

    callRecord.status = "ended";
    callRecord.endedAt = new Date();
    callRecord.endedBy = endedBy;
    callRecord.calculateDuration();
    await callRecord.save();

    // Get bridge and notify the other party
    const bridge = await getOrCreateBridge(bridgeId);
    const otherUserId =
      userId === bridge.callerUserId
        ? bridge.calleeUserId
        : bridge.callerUserId;

    if (otherUserId) {
      const io = getIoInstance();
      const eventData = {
        callId: callRecord.callId,
        bridgeId: bridgeId,
        endedBy: userId,
        duration: callRecord.duration,
      };
      
      console.log('════════════════════════════════════════════════════════');
      console.log('📤 [/call/end] EMITTING call_ended EVENT');
      console.log('   To User:', otherUserId);
      console.log('   Event Data:', JSON.stringify(eventData, null, 2));
      console.log('   Room size:', io.sockets.adapter.rooms.get(otherUserId)?.size || 0);
      console.log('════════════════════════════════════════════════════════');
      
      io.to(otherUserId).emit("call_ended", eventData);
      
      console.log('✅ [/call/end] call_ended event emitted successfully');

      // ---------------------------------------------------------
      // 📲 SEND PUSH NOTIFICATION TO OTHER USER (CALL ENDED)
      // ---------------------------------------------------------
      // try {
      //   const endingUser = await User.findOne({ userId: userId });
      //   await sendCallNotification(userId, otherUserId, {
      //     title: 'Call Ended',
      //     body: `${endingUser?.firstName || 'User'} ${endingUser?.lastName || ''} ended the translation call`,
      //     data: {
      //       callId: callRecord.callId,
      //       bridgeId: bridgeId,
      //       endedBy: userId,
      //       duration: callRecord.duration,
      //       notificationType: 'translation_call_ended',
      //       isTranslationCall: true,
      //     },
      //   }, {
      //     mode: 'kill',
      //     callType: callRecord.callType || 'audio',
      //     apnsTopic: 'com.uhura.app',
      //   });
      //   console.log(`✅ [PUSH] Call ended notification sent to other user`);
      // } catch (pushError) {
      //   console.error('❌ [PUSH] Failed to send call ended notification:', pushError);
      // }
    } else {
      console.log('⚠️ [/call/end] No otherUserId found to notify');
    }

    removeBridge(bridgeId);

    console.log(
      `📴 Call ended. CallID: ${callRecord.callId}, Bridge: ${bridgeId}, Duration: ${callRecord.formattedDuration}, Ended by: ${endedBy}`
    );

    res.json({
      success: true,
      message: "Call ended",
      callId: callRecord.callId,
      duration: callRecord.duration,
      formattedDuration: callRecord.formattedDuration,
    });
  } catch (err) {
    console.error("❌ /call/end failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, skip = 0, status } = req.query;

    const query = {
      $or: [{ "caller.userId": userId }, { "callee.userId": userId }],
    };

    if (status) {
      query.status = status;
    }

    const calls = await Call.find(query)
      .sort({ initiatedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Call.countDocuments(query);

    res.json({
      success: true,
      total,
      calls,
    });
  } catch (err) {
    console.error("❌ /call/history failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/details/:callId", authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;

    const callRecord = await Call.findOne({ callId: callId }).lean();

    if (!callRecord) {
      return res.status(404).json({ error: "Call not found" });
    }

    res.json({
      success: true,
      call: callRecord,
    });
  } catch (err) {
    console.error("❌ /call/details failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;