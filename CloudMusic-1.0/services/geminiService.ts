import { GoogleGenAI, Type } from "@google/genai";

/**
 * Fetches song metadata using Gemini AI.
 * Follows @google/genai guidelines:
 * - Uses gemini-3-flash-preview for basic text tasks.
 * - Initializes GoogleGenAI with process.env.API_KEY.
 * - Creates instance right before the API call.
 */
export const getSongMetadata = async (title: string, artist: string): Promise<{ description: string; mood: string }> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.warn("No API Key found, skipping Gemini enhancement.");
    return { description: "Local track description placeholder.", mood: "Neutral" };
  }

  // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      // Fix: Use 'gemini-3-flash-preview' for basic text tasks as per model selection guidelines.
      model: "gemini-3-flash-preview",
      contents: `Generate a short, engaging description (max 20 words) and a single word 'mood' for the song "${title}" by "${artist}".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            mood: { type: Type.STRING }
          },
          required: ["description", "mood"]
        }
      }
    });

    // Fix: Directly access the .text property from the GenerateContentResponse object.
    const text = response.text;
    if (!text) return { description: "Music metadata unavailable.", mood: "Unknown" };
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error fetching metadata from Gemini:", error);
    return { description: "Music metadata unavailable.", mood: "Unknown" };
  }
};
