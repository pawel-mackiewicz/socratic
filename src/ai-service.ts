import { GoogleGenerativeAI, ChatSession } from '@google/generative-ai';
import { SYSTEM_PROMPT } from './prompt';

let chatSession: ChatSession | null = null;
let genAI: GoogleGenerativeAI | null = null;

export const initializeAI = (apiKey: string) => {
    genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT
    });

    chatSession = model.startChat({
        history: [],
        generationConfig: {
            maxOutputTokens: 8192,
        },
    });

    return true;
};

export const sendMessageToAI = async (message: string, onChunk: (text: string) => void) => {
    if (!chatSession) throw new Error("AI not initialized");

    try {
        const result = await chatSession.sendMessageStream(message);
        let fullText = '';

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            onChunk(fullText);
        }

        return fullText;
    } catch (error) {
        console.error("Error communicating with Gemini:", error);
        throw error;
    }
};
