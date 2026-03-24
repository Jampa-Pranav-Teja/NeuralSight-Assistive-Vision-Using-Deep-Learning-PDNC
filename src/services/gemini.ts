import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface EnvironmentAnalysis {
  description: string;
  hazardDetected: boolean;
  detectedPeople: {
    visualDescription: string;
    isKnown: boolean;
    name?: string;
  }[];
}

export async function analyzeEnvironment(
  base64Image: string, 
  knownPeople: { name: string, description: string }[] = [], 
  question?: string,
  location?: { lat: number, lng: number },
  userName?: string,
  history: { role: 'user' | 'model', text: string }[] = []
) {
  const model = "gemini-3-flash-preview";
  
  const knownPeopleContext = knownPeople.length > 0 
    ? `\nHere are the people I already know:\n${knownPeople.map(p => `- ${p.name}: ${p.description}`).join('\n')}`
    : "";

  const locationContext = location 
    ? `\nThe user's current location is Latitude: ${location.lat}, Longitude: ${location.lng}. Use this for localized pricing or information if relevant to their question.`
    : "";

  const userContext = userName ? `\nThe user's name is ${userName}. Address them by their name when appropriate.` : "";

  const historyContext = history.length > 0 
    ? `\nRecent conversation history:\n${history.map(h => `${h.role}: ${h.text}`).join('\n')}`
    : "";

  const questionContext = question 
    ? `\nTHE USER HAS A SPECIFIC QUESTION: "${question}". Prioritize answering this question accurately based on the image. ${locationContext}`
    : "";

  const systemInstruction = `You are NeuralSight. Provide a concise, ultra-fast audio-style description for the visually impaired.
${userContext}
${historyContext}

CRITICAL: If a user question is provided, you MUST ONLY answer that specific question based on the image provided. Do not provide a general description unless it is necessary to answer the question. Your response should be concise and direct.

If you cannot identify an object or answer the user's specific question based on the image, say "I'm not sure" politely and explain why if possible (e.g., "I'm not sure, the image is a bit blurry").

If the user asks about the price of an item, use Google Search grounding to find the estimated current price in their specific location if possible.

If no specific question is provided:
1. HAZARDS: Identify immediate hazards. Set "hazardDetected" to true.
2. SPATIAL: Use clock-face notation (e.g., 'Chair at 2 o'clock').
3. OCR: Only if relevant.
4. SUMMARY: 1-sentence summary.
5. PERSON RECOGNITION: Identify people. 
   - Known: Use name. 
   - New: Brief description + "Save this person?"

${knownPeopleContext}
${questionContext}

Output JSON:
- "description": Audio text. Focus on answering the question if provided.
- "hazardDetected": Boolean.
- "detectedPeople": Array of {visualDescription, isKnown, name?}.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: question ? `Answer this question: ${question}` : "Describe my environment for navigation and identify people. Prioritize hazards." },
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
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          hazardDetected: { type: Type.BOOLEAN },
          detectedPeople: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                visualDescription: { type: Type.STRING },
                isKnown: { type: Type.BOOLEAN },
                name: { type: Type.STRING }
              },
              required: ["visualDescription", "isKnown"]
            }
          }
        },
        required: ["description", "hazardDetected", "detectedPeople"]
      }
    },
  });

  return JSON.parse(response.text) as EnvironmentAnalysis;
}

export async function textToSpeech(text: string) {
  const model = "gemini-2.5-flash-preview-tts";
  try {
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
  } catch (error: any) {
    if (error?.message?.includes('RESOURCE_EXHAUSTED') || error?.status === 'RESOURCE_EXHAUSTED') {
      console.warn('Gemini TTS Quota Exceeded. Falling back to browser speech.');
    }
    throw error;
  }
}

export async function neuralAssistantQuery(
  query: string, 
  location?: { lat: number, lng: number },
  userName?: string,
  history: { role: 'user' | 'model', text: string }[] = []
) {
  const model = "gemini-3-flash-preview";
  
  const locationContext = location 
    ? `The user's current location is Latitude: ${location.lat}, Longitude: ${location.lng}.`
    : "Location access is not available.";

  const userContext = userName ? `The user's name is ${userName}. Address them by their name when appropriate.` : "";

  const historyContext = history.length > 0 
    ? `\nRecent conversation history:\n${history.map(h => `${h.role}: ${h.text}`).join('\n')}`
    : "";

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: query }],
    config: {
      systemInstruction: `You are the Neural Assistant for NeuralSight. 
      Answer the user's query concisely and helpfully. 
      ${userContext}
      ${locationContext}
      ${historyContext}
      If you cannot answer a question or are unsure about something, say "I'm not sure" politely.
      If the user asks about weather, use your internal knowledge or search grounding to provide current conditions for their location.
      If the user asks for the time, they are likely asking for their local time.
      Current UTC time is provided in the prompt context if needed, but prioritize the user's local context.
      Keep responses brief as they will be read aloud.`,
      tools: [{ googleSearch: {} }]
    },
  });

  return response.text;
}
