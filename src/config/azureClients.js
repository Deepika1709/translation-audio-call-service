import { CallAutomationClient } from "@azure/communication-call-automation";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import sdk from "microsoft-cognitiveservices-speech-sdk";

export const identityClient = new CommunicationIdentityClient(process.env.ACS_CONNECTION_STRING);

export const callAutomationClient = new CallAutomationClient(process.env.ACS_CONNECTION_STRING);

export const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);
speechConfig.speechRecognitionLanguage = "en-US";
export { sdk };
