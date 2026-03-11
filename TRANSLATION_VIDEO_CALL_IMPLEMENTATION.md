# Translation Video Call Implementation Guide

## Overview

This document explains how **Translation Video Calls (TVC)** work in the Uhura system and how to implement them on the client side.

---

## Architecture Comparison

### 1. Normal Video Call (call-service)
```
User A ←→ [Same Group ID] ←→ User B
    (Both audio and video peer-to-peer)
```

### 2. Translation Audio Call (translation-audio-call-service)
```
User A ←→ [GroupA - Audio] ←→ Bot ←→ [GroupB - Audio] ←→ User B
         (Separate groups, bot translates audio)
```
`
### 3. Translation Video Call (translation-audio-call-service) ✅ NEW
```
AUDIO LAYER (for translation):
User A ←→ [GroupA - Audio] ←→ Bot ←→ [GroupB - Audio] ←→ User B

VIDEO LAYER (for peer-to-peer):
User A ←→ [Shared Video Group] ←→ User B

⚠️ Both users join TWO groups:
   1. Their own audio group (for translation)
   2. Shared video group (for direct video streaming)
```

---

## Why This Hybrid Architecture?

### Problem
- **Azure ACS** requires users to be in the **same group** for direct video streaming
- But for **audio translation**, we need **separate groups** so the bot can intercept audio

### Solution
- Use **separate audio groups** (GroupA & GroupB) for translation
- Use a **shared video group** for direct peer-to-peer video streaming
- Users mute audio in the video group and only use audio from their translation group

---

## Backend Changes Made

### 1. Bridge Structure Updated
The bridge now stores:
```javascript
{
  id: "bridge-uuid",
  videoGroupId: "shared-video-group-uuid",  // ✅ NEW - for video peer-to-peer
  legs: {
    A: {
      groupId: "audio-group-a-uuid",  // For translation audio
      language: "en-US",
      acsUserId: "acs-user-a"
    },
    B: {
      groupId: "audio-group-b-uuid",  // For translation audio
      language: "hi-IN",
      acsUserId: "acs-user-b"
    }
  }
}
```

### 2. API Response Changes

#### `/call/initiate` Response (Caller)
```json
{
  "callId": "uuid",
  "bridgeId": "uuid",
  "groupId": "audio-group-a-uuid",      // Audio group for translation
  "videoGroupId": "shared-video-uuid",  // ✅ NEW - Shared video group
  "acsUser": { "acsUserId": "...", "token": "..." },
  "leg": "A",
  "callType": "video",
  "callerLanguage": "en-US"
}
```

#### `/call/accept` Response (Callee)
```json
{
  "callId": "uuid",
  "bridgeId": "uuid",
  "groupId": "audio-group-b-uuid",      // Audio group for translation
  "videoGroupId": "shared-video-uuid",  // ✅ NEW - Same shared video group
  "acsUser": { "acsUserId": "...", "token": "..." },
  "leg": "B",
  "callType": "video",
  "callerLanguage": "en-US",
  "calleeLanguage": "hi-IN"
}
```

#### Socket Event: `incoming_call` (to Callee)
```json
{
  "callId": "uuid",
  "bridgeId": "uuid",
  "callerUserId": "user1",
  "callerName": "John Doe",
  "callerLanguage": "en-US",
  "callType": "video",
  "videoGroupId": "shared-video-uuid"  // ✅ NEW
}
```

#### Socket Event: `call_accepted` (to Caller)
```json
{
  "callId": "uuid",
  "bridgeId": "uuid",
  "calleeUserId": "user2",
  "calleeName": "Jane Smith",
  "calleeLanguage": "hi-IN",
  "videoGroupId": "shared-video-uuid"  // ✅ NEW
}
```

---

## Client-Side Implementation

### Step 1: Initiate Translation Video Call (Caller)

```javascript
// 1. Call the initiate endpoint
const response = await fetch('/call/initiate', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' },
  body: JSON.stringify({
    calleeUserId: 'user2',
    callerLanguage: 'en-US',
    callType: 'video'  // ✅ Specify video
  })
});

const data = await response.json();
/*
{
  callId: "...",
  bridgeId: "...",
  groupId: "audio-group-a",      // Use for audio translation
  videoGroupId: "shared-video",  // Use for video
  acsUser: { acsUserId: "...", token: "..." }
}
*/

// 2. Create ACS CallClient and CallAgent
import { CallClient, LocalVideoStream } from '@azure/communication-calling';

const callClient = new CallClient();
const callAgent = await callClient.createCallAgent(
  { communicationUserId: data.acsUser.acsUserId }, 
  data.acsUser.token
);

// 3. Join AUDIO group (for translation)
const audioCall = callAgent.join(
  { groupId: data.groupId },  // Audio group A
  { 
    audioOptions: { muted: false },  // Audio enabled for translation
    videoOptions: undefined  // No video in audio group
  }
);

// 4. Join VIDEO group (for peer-to-peer video)
const localVideoStream = new LocalVideoStream(
  await navigator.mediaDevices.getUserMedia({ video: true })
);

const videoCall = callAgent.join(
  { groupId: data.videoGroupId },  // ✅ Shared video group
  { 
    audioOptions: { muted: true },  // ⚠️ MUTE audio in video group
    videoOptions: { localVideoStreams: [localVideoStream] }
  }
);

// 5. Handle video streams from the video group only
videoCall.on('remoteParticipantsUpdated', (e) => {
  e.added.forEach(participant => {
    participant.on('videoStreamsUpdated', (e) => {
      e.added.forEach(remoteVideoStream => {
        // Display remote video
        const renderer = new VideoStreamRenderer(remoteVideoStream);
        const view = await renderer.createView();
        document.getElementById('remoteVideo').appendChild(view.target);
      });
    });
  });
});

// 6. Handle translated audio from the audio group
audioCall.on('remoteParticipantsUpdated', (e) => {
  // Bot will provide translated audio automatically
  console.log('Audio translation active');
});
```

### Step 2: Accept Translation Video Call (Callee)

```javascript
// 1. Listen for incoming call
socket.on('incoming_call', async (data) => {
  /*
  {
    callId: "...",
    bridgeId: "...",
    callerUserId: "user1",
    callerName: "John Doe",
    callerLanguage: "en-US",
    callType: "video",
    videoGroupId: "shared-video"  // ✅ Shared video group
  }
  */

  // Show incoming call UI
  showIncomingCallUI(data);
});

// 2. When user accepts, call the accept endpoint
async function acceptCall(bridgeId, calleeLanguage) {
  const response = await fetch('/call/accept', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer <token>' },
    body: JSON.stringify({
      bridgeId: bridgeId,
      calleeLanguage: calleeLanguage  // e.g., 'hi-IN'
    })
  });

  const data = await response.json();
  /*
  {
    callId: "...",
    bridgeId: "...",
    groupId: "audio-group-b",      // Use for audio translation
    videoGroupId: "shared-video",  // Use for video
    acsUser: { acsUserId: "...", token: "..." },
    callerLanguage: "en-US",
    calleeLanguage: "hi-IN"
  }
  */

  // 3. Create ACS CallClient and CallAgent
  const callClient = new CallClient();
  const callAgent = await callClient.createCallAgent(
    { communicationUserId: data.acsUser.acsUserId }, 
    data.acsUser.token
  );

  // 4. Join AUDIO group (for translation)
  const audioCall = callAgent.join(
    { groupId: data.groupId },  // Audio group B
    { 
      audioOptions: { muted: false },  // Audio enabled for translation
      videoOptions: undefined
    }
  );

  // 5. Join VIDEO group (for peer-to-peer video)
  const localVideoStream = new LocalVideoStream(
    await navigator.mediaDevices.getUserMedia({ video: true })
  );

  const videoCall = callAgent.join(
    { groupId: data.videoGroupId },  // ✅ Same shared video group
    { 
      audioOptions: { muted: true },  // ⚠️ MUTE audio in video group
      videoOptions: { localVideoStreams: [localVideoStream] }
    }
  );

  // 6. Handle video and audio as above
  // ... (same as caller)
}
```

---

## Critical Implementation Points

### ⚠️ 1. Two Separate Calls per User
Each user must join **TWO ACS calls**:
- **Audio Call**: For translation (their own audio group)
- **Video Call**: For peer-to-peer video (shared video group)

### ⚠️ 2. Mute Audio in Video Group
**ALWAYS** mute audio in the video call:
```javascript
{ audioOptions: { muted: true } }
```
Otherwise, you'll hear both:
- Original audio from video group
- Translated audio from audio group
This creates echo and confusion!

### ⚠️ 3. Video Only in Video Group
- Enable video **ONLY** in the `videoGroupId` call
- The audio group call should NOT have video enabled

### ⚠️ 4. Audio Only in Audio Group
- Enable audio **ONLY** in the `groupId` call (audio group)
- This audio gets translated by the bot

### ⚠️ 5. Handle Both Calls Lifecycle
When ending the call:
```javascript
await audioCall.hangUp();
await videoCall.hangUp();
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSLATION VIDEO CALL FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

CALLER (User A - English)                CALLEE (User B - Hindi)
─────────────────────────────────────────────────────────────────────

1. POST /call/initiate
   { calleeUserId, 
     callerLanguage: "en-US",
     callType: "video" }
                                         
   ← Response:
     { groupId: "audio-A",
       videoGroupId: "shared-video",
       ... }

2. Join TWO groups:
   - Audio Group A (unmuted audio)
   - Video Group (muted audio, video on)
                                         
                                         3. Receive socket: incoming_call
                                            { videoGroupId: "shared-video" }

                                         4. POST /call/accept
                                            { bridgeId, 
                                              calleeLanguage: "hi-IN" }
                                         
                                            ← Response:
                                              { groupId: "audio-B",
                                                videoGroupId: "shared-video",
                                                ... }

                                         5. Join TWO groups:
                                            - Audio Group B (unmuted audio)
                                            - Video Group (muted audio, video on)

6. Receive socket: call_accepted
   { videoGroupId: "shared-video" }

┌─────────────────────────────────────────────────────────────────────┐
│                      ACTIVE CALL STATE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User A (English)                                    User B (Hindi) │
│  ┌──────────────┐                                   ┌──────────────┐│
│  │ Audio Call A │◄─────────┐         ┌────────────►│ Audio Call B ││
│  │ (unmuted)    │           │         │             │ (unmuted)    ││
│  └──────────────┘           │         │             └──────────────┘│
│                             │         │                              │
│                        ┌────▼─────────▼────┐                        │
│                        │   Translation Bot  │                        │
│                        │  (audio bridge)    │                        │
│                        └────────────────────┘                        │
│                                                                       │
│  ┌──────────────┐                                   ┌──────────────┐│
│  │ Video Call   │◄──────────────────────────────────►│ Video Call   ││
│  │ (muted audio,│     Shared Video Group            │ (muted audio,││
│  │  video on)   │                                   │  video on)   ││
│  └──────────────┘                                   └──────────────┘│
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

Result:
✅ User A speaks English → Bot translates → User B hears Hindi
✅ User B speaks Hindi → Bot translates → User A hears English
✅ Both users see each other's video in real-time (no translation delay)
```

---

## Testing Checklist

- [ ] Caller initiates video call with `callType: "video"`
- [ ] Caller receives both `groupId` (audio) and `videoGroupId`
- [ ] Caller joins both groups (audio unmuted, video with audio muted)
- [ ] Callee receives `videoGroupId` in `incoming_call` event
- [ ] Callee accepts and receives both `groupId` and `videoGroupId`
- [ ] Callee joins both groups (audio unmuted, video with audio muted)
- [ ] Both users see each other's video stream
- [ ] Audio is translated correctly (User A hears translated audio from User B)
- [ ] No audio echo (audio is muted in video group)
- [ ] Call end works for both audio and video calls

---

## Troubleshooting

### Problem: I can see video but can't hear audio
**Solution**: Check that you joined the audio group with `muted: false`

### Problem: I hear double audio (echo)
**Solution**: Ensure audio is muted in the video group: `audioOptions: { muted: true }`

### Problem: Video is not showing
**Solution**: 
- Verify you joined the `videoGroupId`, not the audio `groupId`
- Check camera permissions
- Ensure video is enabled: `videoOptions: { localVideoStreams: [...] }`

### Problem: Translation is not working
**Solution**: 
- Verify bot connected to both audio groups (check backend logs)
- Ensure you're speaking into the audio group call, not the video group

---

## Backward Compatibility

✅ **Translation Audio Calls** (existing) continue to work without changes:
- Only use `groupId` (no `videoGroupId`)
- Bot connects to both audio groups as before

✅ **Normal Video Calls** (call-service) are unaffected:
- Still use single `acsGroupCallId` for both audio and video

---

## Summary

| Call Type | Service | Groups Used | Bot Involvement |
|-----------|---------|-------------|-----------------|
| Normal Audio | call-service | 1 shared group | ❌ No bot |
| Normal Video | call-service | 1 shared group | ❌ No bot |
| Translation Audio | translation-service | 2 separate audio groups (A, B) | ✅ Bot translates |
| **Translation Video** | translation-service | **3 groups**: 2 audio (A, B) + 1 shared video | ✅ Bot translates audio only |

---

## Questions?

For implementation help, check:
- [Azure Communication Services Docs](https://learn.microsoft.com/en-us/azure/communication-services/)
- Backend logs for bot connection status
- This repository's README.md
