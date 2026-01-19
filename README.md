# uhura-translation-call-service

Real-time audio and video call translation service using Azure Communication Services and Azure Cognitive Services.

## Features

- ✅ Real-time audio call translation
- ✅ Real-time video call translation (audio extracted and translated, video passes through)
- ✅ Support for multiple languages
- ✅ Live subtitle generation
- ✅ WebSocket-based audio streaming
- ✅ Separate group architecture for caller/callee

## API Endpoints

### Audio Translation Calls

- `POST /call/initiate` - Initiate audio translation call
- `POST /call/accept` - Accept audio translation call
- `POST /call/reject` - Reject call
- `POST /call/cancel` - Cancel call
- `POST /call/end` - End active call
- `GET /call/history` - Get call history
- `GET /call/details/:callId` - Get call details

### Video Translation Calls

- `POST /call/initiate-video` - Initiate video translation call
- `POST /call/accept-video` - Accept video translation call
- All other endpoints (reject, cancel, end, history) work for both audio and video calls

## How It Works

### Audio Calls
1. Caller initiates call with their language preference
2. Callee accepts with their language preference
3. Bot connects to both group calls and extracts audio
4. Audio is translated in real-time using Azure Speech Services
5. Translated audio is sent back to users

### Video Calls
1. Caller initiates video call with their language preference
2. Callee accepts with their language preference and camera enabled
3. **Video streams pass through ACS directly between users (no processing)**
4. Bot connects to extract **audio only** from the video streams
5. Audio is translated in real-time (same as audio calls)
6. Translated audio is sent back to users while video continues uninterrupted
7. Users see each other on video with real-time translated audio

## Architecture

```
User A (Video + Audio) ←→ ACS Group A ←→ Bot (Audio Only) ←→ Translation ←→ Bot ←→ ACS Group B ←→ User B (Video + Audio)
         ↓                                                                                    ↓
    Video Stream passes through                                                    Video Stream passes through
    Audio extracted for translation                                                Audio extracted for translation
```
