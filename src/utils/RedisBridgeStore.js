import redis from "../config/redis.js";

const BRIDGE_KEY = (id) => `BRIDGE:${id}`;

export async function getBridge(id) {
  const data = await redis.get(BRIDGE_KEY(id));
  return data ? JSON.parse(data) : null;
}

export async function saveBridge(bridge) {
  await redis.set(BRIDGE_KEY(bridge.id), JSON.stringify(bridge));
}

export async function deleteBridge(id) {
  await redis.del(BRIDGE_KEY(id));
}
