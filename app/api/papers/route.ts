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

    if (!query) {
        return NextResponse.json({ papers: [] });
    }

    const options: SearchOptions = {
        maxResults: Math.min(limit, 20),  // Cap at 20
        sort,
        mode
    };

    // 1. Translate Korean query to English for PubMed
    let englishQuery = query;
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query)) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            let modeContext = "";
            if (mode === 'clinical') modeContext = " Focus on clinical trials, case reports, and experimental studies.";
            if (mode === 'evidence') modeContext = " Focus on systematic reviews and meta-analyses.";

            const prompt = `Translate the following Korean medical search term into a concise English phrase optimized for PubMed search.${modeContext} Output ONLY the English phrase: "${query}"`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            englishQuery = response.text().trim().replace(/[".]/g, ''); // Clean quotes and dots
            console.log(`[Papers API] Mode: ${mode}, Translated "${query}" -> "${englishQuery}"`);
        } catch (err) {
            console.error('[Papers API] Translation error:', err);
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
