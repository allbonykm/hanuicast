import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchPubmedPapers, fetchKciPapers, logToFile, Paper, SearchOptions } from '@/lib/paperSources';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sort = (searchParams.get('sort') as 'date' | 'relevance') || 'date';
    const mode = (searchParams.get('mode') as any) || 'general';

    const fullTextOnly = searchParams.get('fullTextOnly') === 'true';
    const category = searchParams.get('category') || '';

    if (!query) {
        return NextResponse.json({ papers: [] });
    }

    const options: SearchOptions = {
        maxResults: Math.min(limit, 20),  // Cap at 20
        sort,
        mode,
        fullTextOnly,
        category
    };

    // 1. Semantic Query Expansion (Translation + MeSH)
    let englishQuery = query;
    // Always run through Gemini if it's Korean OR if a category is selected (for MeSH expansion)
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query) || category) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const categoryPrompts: Record<string, string> = {
                'obgyn': 'Focus on Obstetrics, Gynecology, Infertility, PCOS, Pregnancy, Endometriosis.',
                'kmd': 'Focus on Traditional Korean Medicine, Acupuncture, Herbal Medicine.',
                'neuro': 'Focus on Neuroscience, Behavioral Psychology, Depression, Brain Science.',
                'nutrition': 'Focus on Nutrition, Diet Therapy, Weight Loss, Metabolism.',
                'exercise': 'Focus on Exercise Physiology, Sports Medicine, Rehabilitation.',
                'pharm': 'Focus on Pharmacology, Natural Products, Phytotherapy.'
            };

            const context = categoryPrompts[category as string] || '';
            const prompt = `
            You are an expert medical research assistant.
            User Query: "${query}"
            Context: ${context}
            Task:
            1. Translate the query to English medical terms if needed.
            2. If a specific medical context is provided, expand the query with highly relevant MeSH Terms (Medical Subject Headings) to improve search precision.
            3. Construct a valid PubMed search string using operators (AND, OR).
            4. Output ONLY the raw query string (e.g., "(Probiotics) AND (Depression[MeSH] OR Gut Microbiome)"). Do not add markdown or explanations.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            englishQuery = response.text().trim().replace(/[".]/g, ''); // Clean quotes and dots, but keep () and []
            // Allow basic cleanup but preserve essential search syntax
            englishQuery = englishQuery.replace(/^```|```$/g, '').trim();

            console.log(`[Papers API] Category: ${category}, Translated "${query}" -> "${englishQuery}"`);
        } catch (err) {
            console.error('[Papers API] Translation/Expansion error:', err);
            // Fallback: simple translation if regex matches Korean
            if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query)) {
                // naive fallback or just use original
            }
        }
    }

    // 2. Fetch from both sources in parallel (with error resilience)
    const [pubmedResult, kciResult] = await Promise.allSettled([
        fetchPubmedPapers(englishQuery, options),
        fetchKciPapers(query, options)
    ]);

    const pubmedPapers: Paper[] = (pubmedResult.status === 'fulfilled' && Array.isArray(pubmedResult.value)) ? pubmedResult.value : [];
    const kciPapers: Paper[] = (kciResult.status === 'fulfilled' && Array.isArray(kciResult.value)) ? kciResult.value : [];

    console.log(`[Papers API] Fetch results - PubMed: ${pubmedResult.status} (${pubmedPapers.length}), KCI: ${kciResult.status} (${kciPapers.length})`);

    // Log any errors
    if (pubmedResult.status === 'rejected') {
        console.error('[Papers API] PubMed fetch failed:', pubmedResult.reason);
    }
    if (kciResult.status === 'rejected') {
        console.error('[Papers API] KCI fetch failed:', kciResult.reason);
    }

    // 3. Combine and sort
    try {
        const combined = [...pubmedPapers, ...kciPapers].sort((a, b) => {
            const dateA = new Date(a.date.replace(/\//g, '-'));
            const dateB = new Date(b.date.replace(/\//g, '-'));
            return dateB.getTime() - dateA.getTime();
        });

        console.log(`[Papers API] Returning ${combined.length} papers (PubMed: ${pubmedPapers.length}, KCI: ${kciPapers.length})`);

        return NextResponse.json({
            papers: combined,
            meta: {
                query,
                translatedQuery: englishQuery !== query ? englishQuery : undefined,
                pubmedCount: pubmedPapers.length,
                kciCount: kciPapers.length,
                totalCount: combined.length
            }
        });
    } catch (e: any) {
        console.error('[Papers API] Response generation failed:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
