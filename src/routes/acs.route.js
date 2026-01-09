import express from "express";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const identityClient = new CommunicationIdentityClient(
  process.env.ACS_CONNECTION_STRING
);

router.post("/create-acs-user", async (_req, res) => {
  try {
    console.log("👤 Creating ACS user...");
    const user = await identityClient.createUser();
    const token = await identityClient.getToken(user, ["voip"]);
    console.log(`✅ ACS user created: ${user.communicationUserId}`);

    res.json({
      acsUserId: user.communicationUserId,
      token: token.token,
      expiresOn: token.expiresOn,
    });
  } catch (err) {
    console.error("❌ Failed to create ACS user:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;