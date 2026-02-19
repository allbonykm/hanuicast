import { NextResponse } from 'next/server';
import { generateText } from '../../../lib/ai';
import { KM_SPECIALIST_PROMPT } from '../../../constants/prompts';
import { logToFile } from '../../../lib/paperSources';

export async function POST(req: Request) {
    try {
        const { title, abstract, deep = false } = await req.json();

        if (!abstract) {
            return NextResponse.json({ error: 'Abstract is required' }, { status: 400 });
        }

        const prompt = `
          지침에 맞춰 다음 논문을 분석하고 대본을 작성해줘.
          논문 제목: ${title}
          논문 초록: ${abstract}
        `;

        logToFile(`[Summarize API] Request: title="${title?.substring(0, 30)}...", deep=${deep}`);

        // Use OpenAI for deep analysis, otherwise default to Gemini
        const result = await generateText(prompt, {
            model: deep ? 'openai' : 'gemini',
            systemInstruction: KM_SPECIALIST_PROMPT
        });

        logToFile(`[Summarize API] Result length: ${result.text.length}`);

        return NextResponse.json({ script: result.text });

    } catch (error: any) {
        logToFile(`[Summarize API] Error: ${error.message}`);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
