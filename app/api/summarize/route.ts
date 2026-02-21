import { NextResponse } from 'next/server';
import { generateText } from '../../../lib/ai';
import { KM_SPECIALIST_PROMPT, KM_VERIFIER_PROMPT } from '../../../constants/prompts';
import { logToFile } from '../../../lib/paperSources';

export async function POST(req: Request) {
    try {
        const { title, abstract, deep = false } = await req.json();

        if (!abstract) {
            return NextResponse.json({ error: 'Abstract is required' }, { status: 400 });
        }

        // STEP 1: Initial Drafting
        const draftPrompt = `
          지침에 맞춰 다음 논문을 분석하고 대본을 작성해줘.
          논문 제목: ${title}
          논문 초록: ${abstract}
        `;

        logToFile(`[Summarize API] STEP 1: Initial Drafting. title="${title?.substring(0, 30)}...", deep=${deep}`);

        const draftResult = await generateText(draftPrompt, {
            model: deep ? 'openai' : 'gemini',
            systemInstruction: KM_SPECIALIST_PROMPT
        });

        const draftScript = draftResult.text;
        logToFile(`[Summarize API] STEP 1 Complete. Length: ${draftScript.length}`);

        // STEP 2: Cross-check & Verification (Hallucination Control)
        logToFile(`[Summarize API] STEP 2: Cross-checking with Specialist Persona...`);

        const verificationPrompt = `
          [의학 논문 교차 검증 요청]
          다음 논문의 '원문 초록'과 AI가 작성한 '1차 대본'을 대조하여, 수치 오류나 왜곡된 해석을 바로잡아 최종 대본을 완성해줘.
          
          논문 제목: ${title}
          논문 원문 초록: 
          ${abstract}
          
          1차 대본 (검토 대상):
          ${draftScript}
        `;

        // Verification step by a "Specialist Editor"
        const finalResult = await generateText(verificationPrompt, {
            model: deep ? 'openai' : 'gemini',
            systemInstruction: KM_VERIFIER_PROMPT,
            temperature: 0.2 // Lower temperature for higher factual consistency
        });

        const finalScript = finalResult.text.replaceAll('±', ' 플러스 마이너스 ');
        const isChanged = draftScript !== finalScript;

        logToFile(`[Summarize API] STEP 2 Complete. Final Length: ${finalScript.length}. Changes made: ${isChanged}`);

        if (isChanged) {
            logToFile(`[Summarize API] Hallucination/Consistency check applied. Text was refined.`);
        } else {
            logToFile(`[Summarize API] No changes needed. 1차 draft was accurate.`);
        }

        return NextResponse.json({
            script: finalScript,
            _debug: {
                draftLength: draftScript.length,
                finalLength: finalScript.length,
                refined: isChanged
            }
        });

    } catch (error: any) {
        logToFile(`[Summarize API] Error: ${error.message}`);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
