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

const router = express.Router();

// Helper function to get or create user from JWT data
async function getOrCreateUser(userId, jwtData) {
  try {
    let user = await User.findOne({ userId: userId });
    
    if (!user) {
      console.log(`📝 User ${userId} not found in database, creating from JWT data...`);
      
      // Extract data from JWT token
      const phone = jwtData.phone || `+${userId.substring(0, 12)}`;
      const firstName = jwtData.firstName || jwtData.first_name || 'User';
      const lastName = jwtData.lastName || jwtData.last_name || userId.substring(0, 8);
      const username = jwtData.username || `user_${userId.substring(0, 8)}`;
      const email = jwtData.email || `${userId.substring(0, 8)}@uhura.app`;
      
      user = await User.create({
        userId: userId,
        phone: phone,
        firstName: firstName,
        lastName: lastName,
        username: username,
        email: email,
        isVerified: jwtData.isVerified || true,
        profileStatus: 'Active',
      });
      
      console.log(`✅ User ${userId} created successfully`);
    }
    
    return user;
  } catch (err) {
    console.error(`❌ Error getting/creating user ${userId}:`, err.message);
    throw err;
  }
}

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

    // Get or create users (auto-create from JWT if not exists)
    const callerUser = await getOrCreateUser(callerUserId, req.user);
    const calleeUser = await getOrCreateUser(calleeUserId, { userId: calleeUserId });

    const acsUser = await getOrCreateAcsUser(callerUserId);

    const bridgeId = uuidv4();
    const callId = uuidv4();
    const groupIdA = uuidv4(); // ✅ Separate group for User A (caller)

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
    bridge.legs.A.groupId = groupIdA; // ✅ Each leg has its own group
    bridge.callId = callId;

    // 🔥 Persist changes to Redis
    await updateBridge(bridge);

    const callRecord = await Call.create({
      callId: callId,
      bridgeId: bridgeId,
      callType: callType, // ✅ Use callType from request (audio or video)
      caller: {
        userId: callerUserId,
        language: callerLanguage,
        acsUserId: acsUser.acsUserId,
        groupId: groupIdA, // ✅ Separate group for caller
      },
      callee: {
        userId: calleeUserId,
      },
      status: "initiated",
      initiatedAt: new Date(),
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
    });

    console.log(
      `📞 Call initiated. CallID: ${callId}, Bridge: ${bridgeId}, Caller: ${callerUserId}, Language: ${callerLanguage}`
    );

    return res.json({
      callId: callId,
      acsUser,
      bridgeId,
      groupId: groupIdA, // ✅ Return caller's separate group
      leg: "A",
      callerLanguage: callerLanguage,
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

    // Get or create callee user (auto-create from JWT if not exists)
    const calleeUser = await getOrCreateUser(calleeUserId, req.user);

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
    const groupIdB = uuidv4(); // ✅ Separate group for User B (callee)

    // Store callee's language and ACS user ID in bridge
    bridge.legs.B.language = calleeLanguage;
    bridge.legs.B.userId = calleeUserId;
    bridge.legs.B.acsUserId = acsUser.acsUserId;
    bridge.legs.B.groupId = groupIdB; // ✅ Each leg has its own group

    await updateBridge(bridge);

    // Update call record
    callRecord.callee.language = calleeLanguage;
    callRecord.callee.acsUserId = acsUser.acsUserId;
    callRecord.callee.groupId = groupIdB; // ✅ Separate group for callee
    callRecord.status = "accepted";
    callRecord.acceptedAt = new Date();
    await callRecord.save();

    // ✅ Connect bot to BOTH separate groups
    const groupIdA = bridge.legs.A.groupId;
    
    console.log(`🤖 [ACCEPT] Connecting bot to TWO separate groups:`);
    console.log(`  - Group A (${bridge.legs.A.language}): ${groupIdA}`);
    console.log(`  - Group B (${bridge.legs.B.language}): ${groupIdB}`);
    
    try {
      // Connect to Leg A (caller's group)
      await connectBotToBridgeLeg({
        bridgeId: bridgeId,
        groupId: groupIdA,
        leg: "A", // Bot joins caller's private group
      });
      console.log(`✅ [ACCEPT] Bot connected to Leg A group ${groupIdA}`);
      
      // Connect to Leg B (callee's group)
      await connectBotToBridgeLeg({
        bridgeId: bridgeId,
        groupId: groupIdB,
        leg: "B", // Bot joins callee's private group
      });
      console.log(`✅ [ACCEPT] Bot connected to Leg B group ${groupIdB}`);
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
      });
    }

    console.log(
      `✅ Call accepted. CallID: ${callRecord.callId}, Bridge: ${bridgeId}, Callee: ${calleeUserId}, Language: ${calleeLanguage}`
    );

    res.json({
      callId: callRecord.callId,
      acsUser,
      bridgeId,
      groupId: groupIdB, // ✅ Return Group B for callee to join
      leg: "B",
      callerLanguage: bridge.legs.A.language,
      calleeLanguage: calleeLanguage,
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
      io.to(otherUserId).emit("call_ended", {
        callId: callRecord.callId,
        bridgeId: bridgeId,
        endedBy: userId,
        duration: callRecord.duration,
      });
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
