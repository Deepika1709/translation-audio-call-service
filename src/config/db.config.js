import mongoose from "mongoose";

export const connectDb = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    console.log("Error getting Mongo DB URL in CALL SERVICE ❌");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to Mongo DB in CALL SERVICE");
    
  } catch (error) {
    console.error("Error connecting to Mongo DB in CALL SERVICE ❌");
    process.exit(1);
  }
};
