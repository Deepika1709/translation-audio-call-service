import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function (phone) {
          return /^\+[1-9]\d{1,14}$/.test(phone);
        },
        message: "Phone number must be in E.164 format (e.g., +1234567890)",
      },
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      // unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      // unique: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, "Please enter a valid email address"],
    },
    profilePicUrl: {
      type: String,
      default: null,
    },
    about: {
      type: String,
      default: "",
    },
    profileStatus: {
      type: String,
      enum: ["Active", "Away", "Busy", "Do not Disturb", "Opt-Out"],
      default: "Active",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    acsUserId: {
      type: String,
    },
    preferredLanguage: {
      type: String,
      default: "en-US",
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model("User", userSchema);
