import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    bridgeId: {
      type: String,
      required: true,
      unique: true,
    },
    callType: {
      type: String,
      enum: ["audio", "video"],  
      default: "audio",
    },
    caller: {
      userId: {
        type: String,
        required: true,
        ref: "User",
      },
      language: {
        type: String,
        required: true,
      },
      acsUserId: {
        type: String,
      },
      groupId: {
        type: String,
      },
    },
    callee: {
      userId: {
        type: String,
        required: true,
        ref: "User",
      },
      language: {
        type: String,
      },
      acsUserId: {
        type: String,
      },
      groupId: {
        type: String,
      },
    },
    status: {
      type: String,
      enum: [
        "initiated",     
        "accepted",      
        "rejected",      
        "missed",       
        "ended",        
        "failed",      
        "cancelled",    
      ],
      default: "initiated",
    },
    initiatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number,
      default: 0,
    },
    endedBy: {
      type: String, 
      enum: ["caller", "callee", "system"],
    },
    rejectedAt: {
      type: Date,
    },
    rejectedBy: {
      type: String,  
    },
    metadata: {
      callerCallConnectionId: String,
      calleeCallConnectionId: String,
      translationEnabled: {
        type: Boolean,
        default: true,
      },
      subtitlesCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,  
  }
);

callSchema.index({ "caller.userId": 1, initiatedAt: -1 });
callSchema.index({ "callee.userId": 1, initiatedAt: -1 });
callSchema.index({ status: 1, initiatedAt: -1 });

callSchema.virtual("formattedDuration").get(function () {
  if (!this.duration) return "0s";
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
});

callSchema.methods.calculateDuration = function () {
  if (this.acceptedAt && this.endedAt) {
    this.duration = Math.floor((this.endedAt - this.acceptedAt) / 1000);
  }
  return this.duration;
};

export const Call = mongoose.model("Call", callSchema);
