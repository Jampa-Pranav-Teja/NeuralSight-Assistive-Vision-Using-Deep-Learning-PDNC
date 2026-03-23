import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeEnvironment(base64Image: string) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `You are NeuralSight, an AI assistant for the visually impaired. Analyze the provided image and provide a concise, real-time audio-style description.
1. Identify immediate hazards (stairs, curbs, obstacles) directly in the user's path.
2. Provide spatial awareness using clock-face notation (e.g., 'A chair is at your 2 o'clock').
3. Perform OCR for signs, labels, or currency.
4. Provide a 1-sentence summary of the overall location.
Keep descriptions brief, clear, and focused on navigation.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: "Describe my environment for navigation." },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction,
    },
  });

  return response.text;
}

export async function textToSpeech(text: string) {
  const model = "gemini-2.5-flash-preview-tts";
  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
}
