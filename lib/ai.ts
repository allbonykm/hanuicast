import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { logToFile } from './paperSources';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '',
});

logToFile(`[AI] OpenAI Initialized. Key present: ${!!(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY)}`);

export type AIModel = 'gemini' | 'openai';

export interface AIResponse {
    text: string;
    usage?: any;
}

export async function generateText(
    prompt: string,
    options: {
        model?: AIModel;
        systemInstruction?: string;
        temperature?: number;
    } = {}
): Promise<AIResponse> {
    const { model = 'gemini', systemInstruction, temperature = 0.7 } = options;

    if (model === 'openai') {
        logToFile(`[AI] Starting OpenAI (gpt-4o-mini) request...`);
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Default to mini for cost efficiency
                messages: [
                    ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
                    { role: 'user', content: prompt }
                ],
                temperature,
            });

            logToFile(`[AI] OpenAI request successful.`);
            return {
                text: response.choices[0]?.message?.content || '',
                usage: response.usage
            };
        } catch (error: any) {
            logToFile(`[AI] OpenAI Error: ${error.message}`);
            if (error.status) logToFile(`[AI] OpenAI Status: ${error.status}`);
            if (error.code) logToFile(`[AI] OpenAI Code: ${error.code}`);
            if (error.type) logToFile(`[AI] OpenAI Type: ${error.type}`);

            logToFile('[AI] Falling back to Gemini...');
            // Fallback to Gemini if OpenAI fails
            return generateText(prompt, { ...options, model: 'gemini' });
        }
    } else {
        // Default to Gemini
        logToFile(`[AI] Starting Gemini (gemini-2.0-flash) request...`);
        try {
            const geminiModel = genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                systemInstruction: systemInstruction
            });

            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            logToFile(`[AI] Gemini request successful.`);
            return {
                text: response.text(),
            };
        } catch (error: any) {
            logToFile(`[AI] Gemini Error: ${error.message}`);
            throw error;
        }
    }
}
