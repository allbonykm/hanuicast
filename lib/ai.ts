import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '',
});

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
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Default to mini for cost efficiency
                messages: [
                    ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
                    { role: 'user', content: prompt }
                ],
                temperature,
            });

            return {
                text: response.choices[0]?.message?.content || '',
                usage: response.usage
            };
        } catch (error: any) {
            console.error('[AI] OpenAI Error:', error.message);
            throw error;
        }
    } else {
        // Default to Gemini
        try {
            const geminiModel = genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                systemInstruction: systemInstruction
            });

            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            return {
                text: response.text(),
            };
        } catch (error: any) {
            console.error('[AI] Gemini Error:', error.message);
            throw error;
        }
    }
}
