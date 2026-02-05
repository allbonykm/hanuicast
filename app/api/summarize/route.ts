import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { KM_SPECIALIST_PROMPT } from '../../../constants/prompts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
    try {
        const { title, abstract } = await req.json();

        if (!abstract) {
            return NextResponse.json({ error: 'Abstract is required' }, { status: 400 });
        }

        // Try primary model gemini-2.0-flash
        // Fallback to other available models if needed
        const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting summary with model: ${modelName}`);
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    systemInstruction: KM_SPECIALIST_PROMPT
                });

                const prompt = `
          지침에 맞춰 다음 논문을 분석하고 대본을 작성해줘.
          논문 제목: ${title}
          논문 초록: ${abstract}
        `;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                if (text) {
                    return NextResponse.json({ script: text });
                }
            } catch (error: any) {
                console.warn(`Model ${modelName} failed:`, error.message);
                lastError = error;
                // If it's a 404, we continue to the next model
                if (error.message.includes('404') || error.message.includes('not found')) {
                    continue;
                }
                // For other errors (like safety or rate limit), we might want to stop, 
                // but let's try the next model regardless for robustness.
            }
        }

        throw lastError || new Error('All models failed to generate content');

    } catch (error: any) {
        console.error('Summarize API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
