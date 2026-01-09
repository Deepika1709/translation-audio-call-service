import { getBridge, saveBridge, deleteBridge } from "./RedisBridgeStore.js";

// Re-export getBridge for use in routes
export { getBridge };

const runtimeCache = new Map();

export async function getOrCreateBridge(
  bridgeId,
  callerUserId = null,
  calleeUserId = null
) {
  let stored = await getBridge(bridgeId);

  if (!stored) {
    stored = {
      id: bridgeId, 
      callerUserId,
      calleeUserId,
      callId: null,
      legs: {
        A: {
          language: null,
          userId: callerUserId,
          acsUserId: null,
          callConnectionId: null,
          groupId: null, // ✅ Each leg has its own group ID
        },
        B: {
          language: null,
          userId: calleeUserId,
          acsUserId: null,
          callConnectionId: null,
          groupId: null, // ✅ Each leg has its own group ID
        },
      },
    };

    await saveBridge(stored);
  }

  if (!runtimeCache.has(bridgeId)) {
    runtimeCache.set(bridgeId, {
      legs: {
        A: { ws: null, pushStream: null, recognizer: null, pendingInit: false },
        B: { ws: null, pushStream: null, recognizer: null, pendingInit: false },
      },
    });
  }

  return {
    ...stored,
    runtime: runtimeCache.get(bridgeId),
  };
}

export async function updateBridge(bridge) {
  const { runtime, ...persistable } = bridge;
  await saveBridge(persistable);
}

export async function removeBridge(bridgeId) {
  const runtime = runtimeCache.get(bridgeId);

  if (runtime) {
    if (runtime.legs.A.recognizer) {
      runtime.legs.A.recognizer.stopContinuousRecognitionAsync();
    }
    if (runtime.legs.B.recognizer) {
      runtime.legs.B.recognizer.stopContinuousRecognitionAsync();
    }
  }

  runtimeCache.delete(bridgeId);
  await deleteBridge(bridgeId);

  console.log(`🗑️ Removed BRIDGE ${bridgeId}`);
  return true;
}

export function otherLeg(leg) {
  return leg === "A" ? "B" : "A";
}
