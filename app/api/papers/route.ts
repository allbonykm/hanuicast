import { NextResponse } from 'next/server';
import { generateText } from '@/lib/ai';
import {
    fetchPubmedPapers,
    fetchKciPapers,
    fetchKampoPapers,
    fetchJStagePapers,
    fetchSemanticScholarPapers,
    fetchKoreanTKPapers,
    fetchClinicalTrials, // Added
    logToFile,
    Paper,
    SearchOptions
} from '@/lib/paperSources';


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sort = (searchParams.get('sort') as 'date' | 'relevance') || 'date';
    const mode = (searchParams.get('mode') as any) || 'general';

    const fullTextOnly = searchParams.get('fullTextOnly') === 'true';
    const category = searchParams.get('category') || '';
    const sourceType = searchParams.get('sourceType') || 'papers'; // 'papers' or 'trials'

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

    // 1. Semantic Query Expansion (Translation + MeSH + Kampo + J-STAGE JP + Chinese)
    let englishQuery = query;
    let japaneseQuery = query;
    let chineseQuery = query;
    let trialsQuery = query; // Default to original query
    let recommendedKampoIds: string[] = [];

    // Always run through Gemini if it's Korean OR if a category is selected
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query) || category) {
        try {
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
            You are an expert medical research assistant specializing in global medical research(PubMed), Traditional Korean Medicine(KCI), and East Asian Medicine(KampoDB, J - STAGE, CNKI).
            User Query: "${query}"
            Context: ${context}
            
            Task:
            1. Translate the query to English medical terms if needed.
            2. Expand the PubMed query with highly relevant MeSH Terms.
            3. Recommend up to 3 relevant Kampo Formula IDs(e.g., KT, GRS, ACS) from the KampoDB system.
            4. Translate the query to Japanese scholarly / medical terms for J - STAGE.
            5. Translate the query to Chinese simplified(간체) medical terms for Chinese literature search.
            6. Provide a simplified English search string (no MeSH tags) optimized for ClinicalTrials.gov.
            
            Output MUST be in JSON format:
            {
                "pubmedQuery": "valid pubmed search string with MeSH tags",
                "trialsQuery": "simplified English keywords for ClinicalTrials.gov",
                "kampoIds": ["ID1", "ID2", ...],
                "japaneseQuery": "Japanese search string",
                "chineseQuery": "Simplified Chinese search string",
                "koreanTKQuery": "Traditional Korean Medical terms in Korean/Hanja"
            }
            `;

            // Perform expansion
            const result = await generateText(prompt, { model: 'gemini' });
            const responseText = result.text.trim();

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

            let aiData;
            try {
                aiData = JSON.parse(jsonStr);
            } catch (pErr) {
                console.error('[Papers API] JSON Parse Error. Raw:', responseText);
                aiData = {};
            }

            englishQuery = aiData.pubmedQuery || query;
            trialsQuery = aiData.trialsQuery || englishQuery.replace(/\[.*?\]/g, '');
            recommendedKampoIds = aiData.kampoIds || [];
            japaneseQuery = aiData.japaneseQuery || query;
            chineseQuery = aiData.chineseQuery || query;

            console.log(`[Papers API] AI Expansion: PubMed="${englishQuery.substring(0, 50)}...", Trials="${trialsQuery}"`);
        } catch (err) {
            console.error('[Papers API] AI Expansion error:', err);
        }
    }

    // 2. Fetch from sources
    if (sourceType === 'trials') {
        try {
            const finalTrialsQuery = trialsQuery || query;
            const trials = await fetchClinicalTrials(finalTrialsQuery, { maxResults: 20 });
            return NextResponse.json({
                papers: trials,
                meta: {
                    query,
                    translatedQuery: finalTrialsQuery !== query ? finalTrialsQuery : undefined,
                    totalCount: trials.length
                }
            });
        } catch (err: any) {
            console.error('[Papers API] ClinicalTrials fetch error:', err);
            return NextResponse.json({ papers: [], error: err.message }, { status: 500 });
        }
    }

    // Default: Fetch research papers in parallel
    try {
        const [pubmedResult, kciResult, kampoResult, jstageResult, semanticScholarResult, koreanTKResult] = await Promise.allSettled([
            fetchPubmedPapers(englishQuery, options),
            fetchKciPapers(query, options),
            fetchKampoPapers(recommendedKampoIds),
            fetchJStagePapers(japaneseQuery, options),
            fetchSemanticScholarPapers(`${englishQuery} ${chineseQuery}`, options),
            fetchKoreanTKPapers(query, options)
        ]);

        const pubmedPapers: Paper[] = (pubmedResult.status === 'fulfilled' && Array.isArray(pubmedResult.value)) ? pubmedResult.value : [];
        const kciPapers: Paper[] = (kciResult.status === 'fulfilled' && Array.isArray(kciResult.value)) ? kciResult.value : [];
        const kampoPapers: Paper[] = (kampoResult.status === 'fulfilled' && Array.isArray(kampoResult.value)) ? kampoResult.value : [];
        const jstagePapers: Paper[] = (jstageResult.status === 'fulfilled' && Array.isArray(jstageResult.value)) ? jstageResult.value : [];
        const ssPapers: Paper[] = (semanticScholarResult.status === 'fulfilled' && Array.isArray(semanticScholarResult.value)) ? semanticScholarResult.value : [];
        const tkPapers: Paper[] = (koreanTKResult.status === 'fulfilled' && Array.isArray(koreanTKResult.value)) ? koreanTKResult.value : [];

        const others = [...pubmedPapers, ...kciPapers, ...jstagePapers, ...ssPapers, ...tkPapers].sort((a, b) => {
            const dateA = new Date(a.date.replace(/\//g, '-'));
            const dateB = new Date(b.date.replace(/\//g, '-'));
            return dateB.getTime() - dateA.getTime();
        });

        const combined = [...kampoPapers, ...others];

        return NextResponse.json({
            papers: combined,
            meta: {
                query,
                translatedQuery: englishQuery !== query ? englishQuery : undefined,
                pubmedCount: pubmedPapers.length,
                kciCount: kciPapers.length,
                kampoCount: kampoPapers.length,
                jstageCount: jstagePapers.length,
                semanticScholarCount: ssPapers.length,
                koreanTKCount: tkPapers.length,
                totalCount: combined.length
            }
        });
    } catch (e: any) {
        console.error('[Papers API] Parallel fetch error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
