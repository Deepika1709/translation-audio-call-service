// import sdk from "microsoft-cognitiveservices-speech-sdk";
// import { getOrCreateBridge, otherLeg } from "../utils/bridgeHelper.js";
// import dotenv from "dotenv";
// import { getIoInstance } from "./socket.service.js";

// dotenv.config();

// const CHUNK_INTERVAL_MS = 600;
// const SPEECH_END_SILENCE_MS = "500";

// const LOCALE_TO_TRANSLATION_CODE = {
//   "en-US": "en",
//   "hi-IN": "hi",
//   "fr-FR": "fr",
//   "es-ES": "es",
//   "de-DE": "de",
//   "zh-CN": "zh-Hans",
//   "ja-JP": "ja",
//   "ar-SA": "ar",
//   "pt-BR": "pt",
//   "it-IT": "it",
//   "ko-KR": "ko",
//   "ru-RU": "ru",
// };

// const LANGUAGE_TO_VOICE = {
//   "en-US": "en-US-GuyNeural",
//   "hi-IN": "hi-IN-AaravNeural",
//   "fr-FR": "fr-FR-DeniseNeural",
//   "es-ES": "es-ES-AlvaroNeural",
//   "de-DE": "de-DE-ConradNeural",
//   "zh-CN": "zh-CN-XiaoxiaoNeural",
//   "ja-JP": "ja-JP-NanamiNeural",
//   "ar-SA": "ar-SA-ZariyahNeural",
//   "pt-BR": "pt-BR-AntonioNeural",
//   "it-IT": "it-IT-DiegoNeural",
//   "ko-KR": "ko-KR-InJoonNeural",
//   "ru-RU": "ru-RU-DmitryNeural",
// };

// // to initialize recognizer for a leg
// function initializeRecognizer(bridge, legKey, pushStream) {
//   const myLanguage = bridge.legs[legKey].language;
//   const targetLegKey = otherLeg(legKey);
//   const targetLanguage = bridge.legs[targetLegKey].language;

//   if (!myLanguage || !targetLanguage) {
//     console.log(
//       `⏳ Cannot initialize recognizer for ${bridge.id}/${legKey}: Missing languages (my: ${myLanguage}, target: ${targetLanguage})`
//     );
//     return null;
//   }

//   console.log(
//     `🎧 Initializing recognizer for ${bridge.id}/${legKey} | I speak: ${myLanguage}, they want: ${targetLanguage}`
//   );

//   const speechTranslationConfig = sdk.SpeechTranslationConfig.fromSubscription(
//     process.env.AZURE_SPEECH_KEY,
//     process.env.AZURE_SPEECH_REGION
//   );

//   // my language
//   speechTranslationConfig.speechRecognitionLanguage = myLanguage;

//   // their language
//   const targetTranslationCode =
//     LOCALE_TO_TRANSLATION_CODE[targetLanguage] || "en";
//   speechTranslationConfig.addTargetLanguage(targetTranslationCode);

//   speechTranslationConfig.setProperty(
//     sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
//     SPEECH_END_SILENCE_MS
//   );
//   speechTranslationConfig.setProperty(
//     sdk.PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse,
//     "true"
//   );

//   const recognizer = new sdk.TranslationRecognizer(
//     speechTranslationConfig,
//     sdk.AudioConfig.fromStreamInput(pushStream)
//   );

//   const ttsConfig = sdk.SpeechConfig.fromSubscription(
//     process.env.AZURE_SPEECH_KEY,
//     process.env.AZURE_SPEECH_REGION
//   );
//   ttsConfig.speechSynthesisVoiceName =
//     LANGUAGE_TO_VOICE[targetLanguage] || "en-US-GuyNeural";

//   console.log(
//     `🔊 [Translation Setup][${bridge.id}/${legKey}] ${myLanguage} → ${targetTranslationCode} | Voice: ${ttsConfig.speechSynthesisVoiceName}`
//   );

//   return {
//     recognizer,
//     ttsConfig,
//     targetTranslationCode,
//     targetLegKey,
//     myLanguage,
//     targetLanguage,
//   };
// }

// export function handleLegWebSocket(ws, req, NGROK_BASE) {
//   const url = new URL(req.url, `https://${NGROK_BASE}`);
//   const bridgeId = url.searchParams.get("bridgeId");
//   const legKey = url.searchParams.get("leg") || "A";

//   const bridge = getOrCreateBridge(bridgeId);
//   bridge.legs[legKey].ws = ws;

//   console.log(`🌐 WS connected | bridge=${bridgeId} leg=${legKey}`);

//   const pushStream = sdk.AudioInputStream.createPushStream(
//     sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
//   );

//   // Store push stream in bridge for later access
//   bridge.legs[legKey].pushStream = pushStream;

//   let recognizerData = initializeRecognizer(bridge, legKey, pushStream);

//   if (!recognizerData) {
//     console.log(
//       `⏳ [${bridgeId}/${legKey}] Waiting for both languages to be set...`
//     );
//     bridge.legs[legKey].pendingInit = true;

//     ws.on("message", (data) => {
//       try {
//         const msg = JSON.parse(data.toString());
//         if (msg.kind === "AudioData" && msg.audioData?.data) {
//           const pcm = Buffer.from(msg.audioData.data, "base64");
//           pushStream.write(pcm);
//         }
//       } catch (err) {
//         console.error("❌ WS parse error:", err);
//       }
//     });

//     ws.on("close", () => {
//       console.log(`❌ WS closed for ${bridgeId}/${legKey} (before init)`);
//       pushStream.close();
//     });

//     return;
//   }

//   setupRecognizerHandlers(
//     recognizerData.recognizer,
//     recognizerData.ttsConfig,
//     recognizerData.targetTranslationCode,
//     recognizerData.targetLegKey,
//     bridge,
//     bridgeId,
//     legKey,
//     recognizerData.myLanguage,
//     recognizerData.targetLanguage
//   );

//   recognizerData.recognizer.startContinuousRecognitionAsync();

//   ws.on("message", (data) => {
//     try {
//       const msg = JSON.parse(data.toString());
//       if (msg.kind === "AudioData" && msg.audioData?.data) {
//         const pcm = Buffer.from(msg.audioData.data, "base64");
//         pushStream.write(pcm);
//       }
//     } catch (err) {
//       console.error("❌ WS parse error:", err);
//     }
//   });

//   ws.on("close", () => {
//     console.log(`❌ WS closed for ${bridgeId}/${legKey}`);
//     pushStream.close();
//     recognizerData.recognizer.stopContinuousRecognitionAsync();
//   });
// }

// // to setup recognizer event handlers
// function setupRecognizerHandlers(
//   recognizer,
//   ttsConfig,
//   targetTranslationCode,
//   targetLegKey,
//   bridge,
//   bridgeId,
//   legKey,
//   myLanguage,
//   targetLanguage
// ) {
//   let chunkBuffer = [];
//   let lastChunkTime = Date.now();
//   let isSpeaking = false;

//   recognizer.recognizing = (_s, e) => {
//     const partial = e.result.text?.trim();
//     if (partial) {
//       console.log(`🌀 [Partial][${bridgeId}/${legKey}] ${partial}`);

//       chunkBuffer.push(partial);
//       const now = Date.now();
//       if (now - lastChunkTime > CHUNK_INTERVAL_MS) {
//         const combined = chunkBuffer.join(" ");
//         console.log(`🗣 [Interim][${bridgeId}/${legKey}] ${combined}`);
//         chunkBuffer = [];
//         lastChunkTime = now;
//       }
//     }
//   };

//   recognizer.recognized = async (_s, e) => {
//     if (e.result.reason !== sdk.ResultReason.TranslatedSpeech) return;

//     const originalText = e.result.text.trim();
//     const translated = e.result.translations.get(targetTranslationCode);

//     if (!translated) {
//       console.log(
//         `⚠️ [No Translation][${bridgeId}/${legKey}] for ${targetTranslationCode}`
//       );
//       return;
//     }

//     console.log(
//       `✅ [Translated][${bridgeId}/${legKey}] "${originalText}" (${myLanguage}) → "${translated}" (${targetLanguage})`
//     );

//     if (isSpeaking) return;
//     isSpeaking = true;

//     try {
//       const audioOutput = sdk.AudioOutputStream.createPullStream();
//       const audioConfigOut = sdk.AudioConfig.fromStreamOutput(audioOutput);
//       const synthesizer = new sdk.SpeechSynthesizer(ttsConfig, audioConfigOut);

//       console.log(
//         `🔊 [TTS][${bridgeId}/${legKey}] Synthesizing with ${ttsConfig.speechSynthesisVoiceName}`
//       );

//       synthesizer.speakTextAsync(
//         translated,
//         (result) => {
//           const audioBuffer = Buffer.from(result.audioData);
//           const target = bridge.legs[targetLegKey];

//           if (target?.ws?.readyState === 1) {
//             // sending subtitles
//             target.ws.send(
//               JSON.stringify({
//                 kind: "Subtitle",
//                 text: translated,
//                 fromLeg: legKey,
//                 original: originalText,
//                 sourceLanguage: myLanguage,
//                 targetLanguage: targetLanguage,
//               })
//             );

//             // sending audio
//             target.ws.send(
//               JSON.stringify({
//                 kind: "AudioData",
//                 audioData: { data: audioBuffer.toString("base64") },
//               })
//             );

//             console.log(
//               `💬 [Sent][${bridgeId}] ${legKey}→${targetLegKey} | "${translated}"`
//             );
//           }

//           const targetUserId = bridge.legs[targetLegKey].userId;
//           if (targetUserId) {
//             const io = getIoInstance();

//             io.to(targetUserId).emit("live_subtitle", {
//               bridgeId: bridgeId,
//               translated: translated,
//               original: originalText,
//               sourceLanguage: myLanguage,
//               targetLanguage: targetLanguage,
//               timestamp: new Date().toISOString(),
//             });

//             console.log(
//               `📝 [Subtitle Socket.io] ${legKey}→${targetLegKey} | "${translated}"`
//             );
//           }

//           synthesizer.close();
//           isSpeaking = false;
//         },
//         (err) => {
//           console.error("❌ TTS error:", err);
//           synthesizer.close();
//           isSpeaking = false;
//         }
//       ); 
//     } catch (err) {
//       console.error("❌ TTS failure:", err);
//       isSpeaking = false;
//     }
//   };
// }

// // to reinitialize pending legs
// export function reinitializePendingLeg(bridgeId, legKey) {
//   const bridge = getOrCreateBridge(bridgeId);

//   if (!bridge.legs[legKey].pendingInit) {
//     console.log(`ℹ️ Leg ${legKey} already initialized or doesn't exist`);
//     return;
//   }

//   if (!bridge.legs[legKey].pushStream) {
//     console.log(`❌ No push stream found for ${bridgeId}/${legKey}`);
//     return;
//   }

//   console.log(`🔄 Reinitializing leg ${legKey} for bridge ${bridgeId}`);

//   const recognizerData = initializeRecognizer(
//     bridge,
//     legKey,
//     bridge.legs[legKey].pushStream
//   );

//   if (!recognizerData) {
//     console.log(`❌ Still cannot initialize ${bridgeId}/${legKey}`);
//     return;
//   }

//   setupRecognizerHandlers(
//     recognizerData.recognizer,
//     recognizerData.ttsConfig,
//     recognizerData.targetTranslationCode,
//     recognizerData.targetLegKey,
//     bridge,
//     bridgeId,
//     legKey,
//     recognizerData.myLanguage,
//     recognizerData.targetLanguage
//   );

//   recognizerData.recognizer.startContinuousRecognitionAsync();

//   bridge.legs[legKey].pendingInit = false;
//   bridge.legs[legKey].recognizer = recognizerData.recognizer;

//   console.log(`✅ Leg ${legKey} reinitialized successfully`);
// }

// speech.service.js
import sdk from "microsoft-cognitiveservices-speech-sdk";
import { getOrCreateBridge, getBridge, otherLeg } from "../utils/bridgeHelper.js";
import { CallAutomationClient } from "@azure/communication-call-automation";
import dotenv from "dotenv";
import { getIoInstance } from "./socket.service.js";

dotenv.config();

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const callAutomationClient = new CallAutomationClient(ACS_CONNECTION_STRING);

const CHUNK_INTERVAL_MS = 600;
const SPEECH_END_SILENCE_MS = "500";

// const LOCALE_TO_TRANSLATION_CODE = {
//   "en-US": "en",
//   "hi-IN": "hi",
//   "fr-FR": "fr",
//   "es-ES": "es",
//   "de-DE": "de",
//   "zh-CN": "zh-Hans",
//   "ja-JP": "ja",
//   "ar-SA": "ar",
//   "pt-BR": "pt",
//   "it-IT": "it",
//   "ko-KR": "ko",
//   "ru-RU": "ru",
// };

const LOCALE_TO_TRANSLATION_CODE = {
  // Original 12 languages
  "en-US": "en",
  "hi-IN": "hi",
  "fr-FR": "fr",
  "es-ES": "es",
  "de-DE": "de",
  "zh-CN": "zh-Hans",
  "ja-JP": "ja",
  "ar-SA": "ar",
  "pt-PT": "pt",
  "pt-BR": "pt",
  "it-IT": "it",
  "ko-KR": "ko",
  "ru-RU": "ru",
  
  // NEW: 43 additional languages
  // European (13)
  "cs-CZ": "cs",     // Czech
  "da-DK": "da",     // Danish
  "nl-NL": "nl",     // Dutch
  "fi-FI": "fi",     // Finnish
  "el-GR": "el",     // Greek
  "hu-HU": "hu",     // Hungarian
  "no-NO": "nb",     // Norwegian
  "pl-PL": "pl",     // Polish
  "ro-RO": "ro",     // Romanian
  "sk-SK": "sk",     // Slovak
  "sv-SE": "sv",     // Swedish
  "tr-TR": "tr",     // Turkish
  "uk-UA": "uk",     // Ukrainian
  
  // Indian (10)
  "as-IN": "as",     // Assamese
  "bn-IN": "bn",     // Bengali
  "gu-IN": "gu",     // Gujarati
  "kn-IN": "kn",     // Kannada
  "ml-IN": "ml",     // Malayalam
  "mr-IN": "mr",     // Marathi
  "or-IN": "or",     // Odia
  "pa-IN": "pa",     // Punjabi
  "ta-IN": "ta",     // Tamil
  "te-IN": "te",     // Telugu
  
  // Asian (4)
  "th-TH": "th",     // Thai
  "vi-VN": "vi",     // Vietnamese
  "id-ID": "id",     // Indonesian
  "ms-MY": "ms",     // Malay
  
  // Middle Eastern & Central Asian (6)
  "az-AZ": "az",     // Azerbaijani
  "fa-IR": "fa",     // Persian
  "he-IL": "he",     // Hebrew
  "ur-PK": "ur",     // Urdu
  "kk-KZ": "kk",     // Kazakh
  "uz-UZ": "uz",     // Uzbek
  
  // African (2)
  "sw-KE": "sw",     // Swahili
  "am-ET": "am",     // Amharic
  
  // Other (3)
  "ca-ES": "ca",     // Catalan
  "gl-ES": "gl",     // Galician
  "eu-ES": "eu",     // Basque
};


// const LANGUAGE_TO_VOICE = {
//   "en-US": "en-US-GuyNeural",
//   "hi-IN": "hi-IN-AaravNeural",
//   "fr-FR": "fr-FR-DeniseNeural",
//   "es-ES": "es-ES-AlvaroNeural",
//   "de-DE": "de-DE-ConradNeural",
//   "zh-CN": "zh-CN-XiaoxiaoNeural",
//   "ja-JP": "ja-JP-NanamiNeural",
//   "ar-SA": "ar-SA-ZariyahNeural",
//   "pt-BR": "pt-BR-AntonioNeural",
//   "it-IT": "it-IT-DiegoNeural",
//   "ko-KR": "ko-KR-InJoonNeural",
//   "ru-RU": "ru-RU-DmitryNeural",
// };

// REMOVED: Language detection filter - not needed with separate group architecture

// Initialize recognizer for a leg

const LANGUAGE_TO_VOICE = {
  // Original voices
  "en-US": "en-US-GuyNeural",
  "hi-IN": "hi-IN-MadhurNeural",
  "fr-FR": "fr-FR-DeniseNeural",
  "es-ES": "es-ES-AlvaroNeural",
  "de-DE": "de-DE-ConradNeural",
  "zh-CN": "zh-CN-XiaoxiaoNeural",
  "ja-JP": "ja-JP-NanamiNeural",
  "ar-SA": "ar-SA-ZariyahNeural",
  "pt-PT": "pt-PT-RaquelNeural",
  "pt-BR": "pt-BR-AntonioNeural",
  "it-IT": "it-IT-DiegoNeural",
  "ko-KR": "ko-KR-InJoonNeural",
  "ru-RU": "ru-RU-DmitryNeural",
  
  // NEW: 43 additional Azure TTS voices
  // European
  "cs-CZ": "cs-CZ-AntoninNeural",
  "da-DK": "da-DK-ChristelNeural",
  "nl-NL": "nl-NL-ColetteNeural",
  "fi-FI": "fi-FI-SelmaNeural",
  "el-GR": "el-GR-NestorasNeural",
  "hu-HU": "hu-HU-NoemiNeural",
  "no-NO": "nb-NO-FinnNeural",
  "pl-PL": "pl-PL-MarekNeural",
  "ro-RO": "ro-RO-AlinaNeural",
  "sk-SK": "sk-SK-LukasNeural",
  "sv-SE": "sv-SE-MattiasNeural",
  "tr-TR": "tr-TR-AhmetNeural",
  "uk-UA": "uk-UA-OstapNeural",
  
  // Indian
  "as-IN": "en-IN-NeerjaNeural",  // Assamese (fallback to English-India)
  "bn-IN": "bn-IN-BashkarNeural",
  "gu-IN": "gu-IN-DhwaniNeural",
  "kn-IN": "kn-IN-GaganNeural",
  "ml-IN": "ml-IN-MidhunNeural",
  "mr-IN": "mr-IN-ManoharNeural",
  "or-IN": "en-IN-NeerjaNeural",  // Odia (fallback to English-India)
  "pa-IN": "pa-IN-GianNeural",
  "ta-IN": "ta-IN-ValluvarNeural",
  "te-IN": "te-IN-MohanNeural",
  
  // Asian
  "th-TH": "th-TH-NiwatNeural",
  "vi-VN": "vi-VN-NamMinhNeural",
  "id-ID": "id-ID-ArdiNeural",
  "ms-MY": "ms-MY-OsmanNeural",
  
  // Middle Eastern
  "az-AZ": "az-AZ-BabekNeural",
  "fa-IR": "fa-IR-DilaraNeural",
  "he-IL": "he-IL-AvriNeural",
  "ur-PK": "ur-PK-AsadNeural",
  "kk-KZ": "kk-KZ-DauletNeural",
  "uz-UZ": "uz-UZ-MadinaNeural",
  
  // African
  "sw-KE": "sw-KE-RafikiNeural",
  "am-ET": "am-ET-AmehaNeural",
  
  // Other
  "ca-ES": "ca-ES-EnricNeural",
  "gl-ES": "gl-ES-RoiNeural",
  "eu-ES": "en-US-GuyNeural", // Fallback
};
function initializeRecognizer(bridge, legKey, pushStream) {
  const storedLeg = bridge.legs[legKey]; // persistent
  const runtimeLeg = bridge.runtime.legs[legKey]; // runtime

  const targetLegKey = otherLeg(legKey);
  const targetStoredLeg = bridge.legs[targetLegKey];

  const myLanguage = storedLeg.language;
  const targetLanguage = targetStoredLeg.language;

  if (!myLanguage || !targetLanguage) {
    console.log(
      `⏳ Cannot initialize recognizer for ${bridge.id}/${legKey}: Missing languages (my: ${myLanguage}, target: ${targetLanguage})`
    );
    return null;
  }

  console.log(
    `🎧 Initializing recognizer for ${bridge.id}/${legKey} | I speak: ${myLanguage} → They need: ${targetLanguage}`
  );

  const speechTranslationConfig = sdk.SpeechTranslationConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );

  speechTranslationConfig.speechRecognitionLanguage = myLanguage;

  const targetTranslationCode =
    LOCALE_TO_TRANSLATION_CODE[targetLanguage] || "en";

  speechTranslationConfig.addTargetLanguage(targetTranslationCode);
  speechTranslationConfig.setProperty(
    sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
    SPEECH_END_SILENCE_MS
  );

  speechTranslationConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse,
    "true"
  );

  const recognizer = new sdk.TranslationRecognizer(
    speechTranslationConfig,
    sdk.AudioConfig.fromStreamInput(pushStream)
  );

  const ttsConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );

  ttsConfig.speechSynthesisVoiceName =
    LANGUAGE_TO_VOICE[targetLanguage] || "en-US-GuyNeural";

  console.log(
    `🔊 [Translation Setup][${bridge.id}/${legKey}] ${myLanguage} → ${targetTranslationCode} | Voice: ${ttsConfig.speechSynthesisVoiceName}`
  );

  return {
    recognizer,
    ttsConfig,
    targetTranslationCode,
    targetLegKey,
    myLanguage,
    targetLanguage,
  };
}

export async function handleLegWebSocket(ws, req, NGROK_BASE) {
  const url = new URL(req.url, `https://${NGROK_BASE}`);
  const bridgeId = url.searchParams.get("bridgeId");
  const legKey = url.searchParams.get("leg") || "A";

  const bridge = await getOrCreateBridge(bridgeId);
  
  // Store WebSocket for this specific leg
  const runtimeLeg = bridge.runtime.legs[legKey];
  runtimeLeg.ws = ws;
  console.log(`🌐 WS connected | bridge=${bridgeId} leg=${legKey} | WebSocket State: ${ws.readyState} (1=OPEN)`);
  
  console.log(`📊 Bridge status: Leg A WS=${bridge.runtime.legs.A.ws ? 'EXISTS' : 'MISSING'}, Leg B WS=${bridge.runtime.legs.B.ws ? 'EXISTS' : 'MISSING'}`);

  // Create push stream for this leg only
  const pushStream = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
  );
  runtimeLeg.pushStream = pushStream;

  let recognizerData = initializeRecognizer(bridge, legKey, pushStream);

  if (!recognizerData) {
    console.log(
      `⏳ [${bridgeId}/${legKey}] Waiting for both languages to be set…`
    );
    runtimeLeg.pendingInit = true;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.kind === "AudioData" && msg.audioData?.data) {
          const pcm = Buffer.from(msg.audioData.data, "base64");
          pushStream.write(pcm);
        }
      } catch (err) {
        console.error("❌ WS parse error:", err);
      }
    });

    ws.on("close", () => {
      console.log(`❌ WS closed for ${bridgeId}/${legKey} (before init)`);
      pushStream.close();
    });

    return;
  }

  setupRecognizerHandlers(
    recognizerData.recognizer,
    recognizerData.ttsConfig,
    recognizerData.targetTranslationCode,
    recognizerData.targetLegKey,
    bridge,
    bridgeId,
    legKey,
    recognizerData.myLanguage,
    recognizerData.targetLanguage
  );

  recognizerData.recognizer.startContinuousRecognitionAsync();
  runtimeLeg.recognizer = recognizerData.recognizer;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.kind === "AudioData" && msg.audioData?.data) {
        const pcm = Buffer.from(msg.audioData.data, "base64");
        pushStream.write(pcm);
      }
    } catch (err) {
      console.error("❌ WS parse error:", err);
    }
  });

  ws.on("close", () => {
    console.log(`❌ WS closed for ${bridgeId}/${legKey}`);
    pushStream.close();
    runtimeLeg.recognizer?.stopContinuousRecognitionAsync();
  });
}

function setupRecognizerHandlers(
  recognizer,
  ttsConfig,
  targetTranslationCode,
  targetLegKey,
  bridge,
  bridgeId,
  legKey,
  myLanguage,
  targetLanguage
) {
  let chunkBuffer = [];
  let lastChunkTime = Date.now();
  let isSpeaking = false;

  recognizer.recognizing = (_s, e) => {
    const partial = e.result.text?.trim();
    if (partial) {
      console.log(`🌀 [Partial][${bridgeId}/${legKey}] ${partial}`);

      chunkBuffer.push(partial);
      const now = Date.now();
      if (now - lastChunkTime > CHUNK_INTERVAL_MS) {
        const combined = chunkBuffer.join(" ");
        console.log(`🗣 [Interim][${bridgeId}/${legKey}] ${combined}`);
        chunkBuffer = [];
        lastChunkTime = now;
      }
    }
  };

  recognizer.recognized = async (_s, e) => {
    if (e.result.reason !== sdk.ResultReason.TranslatedSpeech) return;

    const originalText = e.result.text.trim();
    const translated = e.result.translations.get(targetTranslationCode);

    if (!translated) {
      console.log(
        `⚠️ [No Translation][${bridgeId}/${legKey}] Missing ${targetTranslationCode}`
      );
      return;
    }

    console.log(
      `✅ [Translated][${bridgeId}/${legKey}] "${originalText}" (${myLanguage}) → "${translated}" (${targetLanguage})`
    );

    // 🔥 CRITICAL FIX: Fetch the LATEST bridge state from Redis to get updated callConnectionId
    const latestBridge = await getBridge(bridgeId);
    if (!latestBridge) {
      console.log(`⚠️ Bridge ${bridgeId} not found, skipping translation playback`);
      return;
    }

    const targetStoredLeg = latestBridge.legs[targetLegKey];
    const io = getIoInstance();
    
    io.to(targetStoredLeg.userId).emit("live_subtitle", {
      bridgeId,
      translated,
      original: originalText,
      sourceLanguage: myLanguage,
      targetLanguage,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `📝 [Subtitle Socket.io] ${legKey}→${targetLegKey} | "${translated}"`
    );

    // 🔥 FINAL FIX: Stream TTS audio back through the bot's bidirectional WebSocket
    // This is the ONLY way to send audio back when using connectCall() - the bot's
    // connection is for media streaming, not as a participant, so play() doesn't work
    
    if (isSpeaking) {
      console.log(`⏳ Already speaking, skipping...`);
      return;
    }
    isSpeaking = true;

    try {
      const targetRuntimeLeg = bridge.runtime.legs[targetLegKey];
      
      // Check if target WebSocket exists and is ready
      if (!targetRuntimeLeg) {
        console.log(`⚠️ Target runtime leg ${targetLegKey} not found in bridge`);
        isSpeaking = false;
        return;
      }
      
      if (!targetRuntimeLeg.ws) {
        console.log(`⚠️ Target WebSocket for ${targetLegKey} does not exist.`);
        console.log(`⚠️ This is an Azure Call Automation limitation - bidirectional streaming only works for the first group call.`);
        console.log(`⚠️ Subtitles will work, but audio playback requires alternative architecture.`);
        
        isSpeaking = false;
        return;
      }
      
      if (targetRuntimeLeg.ws.readyState !== 1) {
        console.log(`⚠️ Target WebSocket for ${targetLegKey} not ready (state: ${targetRuntimeLeg.ws.readyState})`);
        console.log(`   WebSocket states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED`);
        isSpeaking = false;
        return;
      }

      console.log(`🔊 [TTS] Synthesizing "${translated}" with ${ttsConfig.speechSynthesisVoiceName}`);
      
      // Create TTS synthesizer
      const audioOutput = sdk.AudioOutputStream.createPullStream();
      const audioConfigOut = sdk.AudioConfig.fromStreamOutput(audioOutput);
      const synthesizer = new sdk.SpeechSynthesizer(ttsConfig, audioConfigOut);

      synthesizer.speakTextAsync(
        translated,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // Azure Speech SDK returns audio in WAV format, but ACS bidirectional streaming
            // expects raw PCM (16kHz, 16-bit, mono). WAV format has a 44-byte header, so skip it.
            const audioBuffer = Buffer.from(result.audioData);
            
            // Skip WAV header (first 44 bytes) to get raw PCM data
            const pcmData = audioBuffer.slice(44);
            
            // Send audio back through the bot's bidirectional WebSocket in chunks
            if (targetRuntimeLeg.ws && targetRuntimeLeg.ws.readyState === 1) {
              // ACS expects PCM audio in chunks, send in 3200-byte chunks (100ms of audio)
              const chunkSize = 3200; // 100ms at 16kHz, 16-bit mono
              
              for (let i = 0; i < pcmData.length; i += chunkSize) {
                const chunk = pcmData.slice(i, i + chunkSize);
                
                targetRuntimeLeg.ws.send(
                  JSON.stringify({
                    kind: "AudioData",
                    audioData: { data: chunk.toString("base64") },
                  })
                );
              }
              
              console.log(`✅ [Audio Streamed] ${legKey}→${targetLegKey} | ${pcmData.length} bytes PCM (${(pcmData.length / 32000).toFixed(2)}s)`);
            } else {
              console.log(`⚠️ Target WebSocket closed before sending audio`);
            }
          } else {
            console.error(`❌ TTS synthesis failed: ${result.reason}`);
          }
          
          synthesizer.close();
          isSpeaking = false;
        },
        (err) => {
          console.error(`❌ TTS error:`, err);
          synthesizer.close();
          isSpeaking = false;
        }
      );
    } catch (error) {
      console.error(`❌ [Audio Playback Error]`, error.message);
      isSpeaking = false;
    }
  };
}

export async function reinitializePendingLeg(bridgeId, legKey) {
  const bridge = await getOrCreateBridge(bridgeId);
  
  const runtimeLeg = bridge.runtime.legs[legKey];

  console.log(`🔄 Attempting to reinitialize ${bridgeId}/${legKey}`);

  console.log("Bridge --->", bridge);

  console.log("Runtime Leg --->", runtimeLeg);

  if (!runtimeLeg.pendingInit) {
    console.log(`ℹ️ Leg ${legKey} already initialized`);
    return;
  }

  if (!runtimeLeg.pushStream) {
    console.log(`❌ No pushStream for ${bridgeId}/${legKey}`);
    return;
  }

  console.log(`🔄 Reinitializing ${bridgeId}/${legKey}`);

  const recognizerData = initializeRecognizer(
    bridge,
    legKey,
    runtimeLeg.pushStream
  );

  if (!recognizerData) {
    console.log(`❌ Still missing languages for ${bridgeId}/${legKey}`);
    return;
  }

  setupRecognizerHandlers(
    recognizerData.recognizer,
    recognizerData.ttsConfig,
    recognizerData.targetTranslationCode,
    recognizerData.targetLegKey,
    bridge,
    bridgeId,
    legKey,
    recognizerData.myLanguage,
    recognizerData.targetLanguage
  );

  recognizerData.recognizer.startContinuousRecognitionAsync();
  runtimeLeg.recognizer = recognizerData.recognizer;
  runtimeLeg.pendingInit = false;

  console.log(`✅ Leg ${legKey} reinitialized`);
}
