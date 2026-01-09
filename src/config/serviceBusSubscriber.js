import { ServiceBusClient } from "@azure/service-bus";
import { User } from "../models/User.model.js";
// import { Business } from "../models/Business.model.js";

class ServiceBusSubscriber {
  constructor() {
    this.client = null;
    this.receivers = new Map();
  }

  async connect() {
    try {
      if (!process.env.AZURE_SERVICE_BUS_CONNECTION_STRING) {
        throw new Error("AZURE_SERVICE_BUS_CONNECTION_STRING is required");
      }

      this.client = new ServiceBusClient(
        process.env.AZURE_SERVICE_BUS_CONNECTION_STRING
      );
      console.log("✅ CALL 📞-service Azure Service Bus Subscriber connected");
    } catch (error) {
      console.error("❌ Service Bus Subscriber connection error:", error);
      throw error;
    }
  }

  async initChatEventHandler() {
    try {
      if (!this.client) {
        await this.connect();
      }
      const subscriptionName = "call-service-subscription"; // create this in Azure Portal
      const receiver = this.client.createReceiver(
        "user-events",
        subscriptionName
      );

      this.receivers.set("user-events", receiver);

      const messageHandler = async (messageReceived) => {
        try {
          const { event, source, data } = JSON.parse(messageReceived.body);

          console.log(
            "📞 call-service received message:",
            event,
            "from:",
            source
          );

          // ⛔️ Only process messages enriched by user-service
          if (source !== "user-service") {
            console.log("⚠️ Skipping non-enriched event from:", source);
            await receiver.completeMessage(messageReceived);
            return;
          }

          // Handle different events from user-service

          // When user-service receives USER_SIGNED_UP from auth-service
          if (event === "USER_SIGNED_UP") {
            console.log("📝 Processing new user signup for Call 📞 service");

            const {
              userId,
              phone,
              firstName,
              lastName,
              username,
              email,
              about,
              profilePicUrl,
              isVerified,
              acsUserId,
            } = data;

            console.log("ACS USER ID ------> ----> --> ", acsUserId);

            console.log("DATA GETTING FROM THE USER-SERVICE ---> ", data);
 
            try {
              await User.updateOne(
                { userId },  
                {
                  $set: {
                    phone,
                    firstName: firstName || "",
                    lastName: lastName || "",
                    username,
                    email,
                    about: about || "",
                    profilePicUrl,
                    isVerified: isVerified ?? false,
                    lastLogin: new Date(),
                    acsUserId,
                  },
                },
                { upsert: true }
              );
            } catch (err) {
              if (err?.code === 11000) {
                await User.updateOne(
                  { userId },
                  {
                    $set: {
                      phone,
                      firstName,
                      lastName,
                      username,
                      email,
                      about,
                      profilePicUrl,
                      isVerified: !!isVerified,
                      lastLogin: new Date(),
                      acsUserId,
                    },
                  }
                );
              } else {
                throw err;
              }
            }

            console.log(`✅ Created/Updated 📞 call user: ${userId}`);
          }
          // When user updates profile in user-service
          if (event === "USER_PROFILE_UPDATED") {
            console.log(
              "🔄 Processing user profile update for CALL 📞 service"
            );

            const {
              userId,
              firstName,
              lastName,
              username,
              about,
              profilePicUrl,
              profileStatus,
            } = data;

            const updateFields = {};
            if (firstName !== undefined) updateFields.firstName = firstName;
            if (lastName !== undefined) updateFields.lastName = lastName;
            if (username !== undefined) updateFields.username = username;
            if (about !== undefined) updateFields.about = about;
            if (profilePicUrl !== undefined)
              updateFields.profilePicUrl = profilePicUrl;
            if (profileStatus !== undefined)
              updateFields.profileStatus = profileStatus;

            await User.findOneAndUpdate(
              { userId },
              { $set: updateFields },
              { new: true }
            );

            console.log(`✅ Updated CALL 📞 user profile: ${userId}`);
          }
          await receiver.completeMessage(messageReceived);
        } catch (error) {
          console.error("❌ Failed to process CALL 📞 event:", error);
          await receiver.abandonMessage(messageReceived);
        }
      };

      const errorHandler = async (error) => {
        console.error("❌ Service Bus receiver error (CALL 📞-events):", error);
      };

      receiver.subscribe({
        processMessage: messageHandler,
        processError: errorHandler,
      });

      console.log("✅ Subscribed to 'CALL 📞-events' channel");
    } catch (error) {
      console.error("❌ Error initializing CALL 📞 event handler:", error);
      throw error;
    }
  }

  async close() {
    try {
      for (const receiver of this.receivers.values()) {
        await receiver.close();
      }
      this.receivers.clear();

      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      console.log("✅ Service Bus Subscriber closed");
    } catch (error) {
      console.error("❌ Error closing Service Bus Subscriber:", error);
    }
  }
}

const serviceBusSubscriber = new ServiceBusSubscriber();
export { serviceBusSubscriber };
