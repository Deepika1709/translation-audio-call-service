// // src/services/pushNotificationService.js

// import axios from 'axios';
// import dotenv from 'dotenv';

// dotenv.config();

// const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4003';

// /**
//  * Send translation call notification to user through notification service
//  * This ensures notifications work in all states: foreground, background, and kill mode
//  * Just like message notifications, we delegate to notification-service
//  * 
//  * @param {string} senderId - ID of the user initiating the notification
//  * @param {string} receiverId - ID of the user receiving the notification
//  * @param {object} payload - Notification payload with title, body, and data
//  * @param {object} options - Options like mode (foreground/background/kill) and callType
//  */
// export async function sendCallNotification(
//   senderId,
//   receiverId,
//   payload = {},
//   options = {},
// ) {
//   try {
//     const { mode = 'kill', callType = 'audio', apnsTopic = 'com.uhura.app' } = options;

//     console.log(`[translation-call-push] Sending translation ${callType} call notification to user ${receiverId} in ${mode} mode`);
//     console.log(`[translation-call-push] Payload:`, JSON.stringify(payload, null, 2));

//     // Prepare notification data - same format as message notifications
//     const notificationData = {
//       toUserId: receiverId,
//       title: payload.title || 'Incoming Translation Call',
//       body: payload.body || 'You have an incoming translation call',
//       data: {
//         ...payload.data,
//         notificationType: payload.data?.notificationType || 'translation_call',
//         callType: callType, // 'audio' or 'video'
//         isTranslationCall: true, // Mark as translation call
//       },
//       mode: mode, // 'foreground', 'background', or 'kill'
//       apnsTopic: apnsTopic,
//     };

//     // Call notification service API (same as message notifications)
//     const response = await axios.post(
//       `${NOTIFICATION_SERVICE_URL}/notifications/send`,
//       notificationData,
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'x-service-secret': process.env.NOTIF_SHARED_SECRET || '',
//           'x-sender-id': senderId,
//         },
//         timeout: 10000,
//       }
//     );

//     console.log(`[translation-call-push] ✅ Notification sent successfully:`, response.data);
//     return { success: true, data: response.data };
//   } catch (error) {
//     console.error(`[translation-call-push] ❌ Failed to send notification:`, error.message);
    
//     if (error.response) {
//       console.error(`[translation-call-push] Response error:`, {
//         status: error.response.status,
//         data: error.response.data,
//       });
//     }

//     // Don't throw error - let call proceed even if notification fails
//     return { success: false, error: error.message };
//   }
// }
