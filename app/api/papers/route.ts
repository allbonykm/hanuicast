import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';

    // 1. Translate Korean query to English medical terms using Gemini
    let englishQuery = query;
    if (query && /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query)) {
        try {
            // Using same model as summarize API
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const prompt = `Translate the following Korean medical search term into a concise English phrase optimized for PubMed search. Output ONLY the English phrase: "${query}"`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            englishQuery = response.text().trim();
            console.log(`[PubMed Search] Translated "${query}" -> "${englishQuery}"`);
        } catch (err) {
            console.error('[PubMed Search] Translation error:', err);
            // Fallback: If translation fails, just use original query (eutils might find something if it's already mixed)
        }
    }

    let pubmedPapers: any[] = [];

    // 2. Fetch from PubMed if query exists
    if (englishQuery) {
        try {
            const apiKey = process.env.PUBMED_API_KEY ? `&api_key=${process.env.PUBMED_API_KEY}` : '';

            // Step A: ESearch (get IDs)
            const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(englishQuery)}&retmode=json&retmax=5${apiKey}`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            const ids = searchData.esearchresult.idlist;

            if (ids && ids.length > 0) {
                // Step B: ESummary (get details)
                const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${apiKey}`;
                const summaryRes = await fetch(summaryUrl);
                const summaryData = await summaryRes.json();

                pubmedPapers = ids.map((id: string) => {
                    const item = summaryData.result[id];
                    if (!item) return null;
                    return {
                        id: `pubmed_${id}`,
                        title: item.title,
                        authors: item.authors?.map((a: any) => a.name).join(', ') || 'Unknown Authors',
                        journal: item.fulljournalname || item.source,
                        date: item.pubdate,
                        abstract: `[PubMed ID: ${id}] This article was found in PubMed. Click to generate an AI summary.`,
                        tags: ["PubMed", englishQuery],
                        originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
                    };
                }).filter(Boolean);
            }
        } catch (err) {
            console.error('[PubMed Search] API Fetch error:', err);
        }
    }

    // Mock Data (KCI Fallback)
    const mockPapers = [
        {
            id: "kci_001",
            title: "만성 피로 증후군 환자에 대한 보중익기탕의 임상적 유효성 및 안전성",
            authors: "김준호, 박미래 외",
            journal: "대한한방내과학회지",
            date: "2024-12-15",
            abstract: "본 연구는 만성 피로를 호소하는 환자 60명을 대상으로 보중익기탕 투여 전후의 피로도 점수(VAS)와 면역 지표 변화를 관찰하였다. 연구 결과, 보중익기탕 투여군은 대조군 대비 유의미한 피로 개선 효과를 보였으며, 간기능 및 신기능 검사에서 특이 소견이 관찰되지 않아 안전성을 확인하였다.",
            tags: ["보중익기탕", "만성피로", "임상연구"],
            originalUrl: "https://www.kci.go.kr/kciportal/main.kci"
        },
        {
            id: "kci_002",
            title: "수분 대사 조절 장애 모델에서 오령산의 이뇨 효과 및 기전 연구",
            authors: "이지연, 최성현 외",
            journal: "대한한의학방제학회지",
            date: "2025-01-20",
            abstract: "오령산이 신장의 수분 채널인 Aquaporin-2의 발현에 미치는 영향을 탐구하였다. 실험 결과, 오령산은 체내 수분 정체 상황에서 유의미한 이뇨 효율 증진을 보였으며, 이는 전해질 불균형을 야기하지 않는 부드러운 조절 기전을 가짐을 시사한다.",
            tags: ["오령산", "수분대사", "AQP2"],
            originalUrl: "https://www.kci.go.kr/kciportal/main.kci"
        },
        {
            id: "kci_003",
            title: "원발성 생리통 환자에 대한 현부이경탕의 진통 효과: 무작위 대조군 연구",
            authors: "박지민, 이서윤 외",
            journal: "대한한방부인과학회지",
            date: "2024-11-10",
            abstract: "본 연구는 원발성 생리통(Dysmenorrhea)을 호소하는 20-30대 여성 45명을 대상으로 현부이경탕의 통증 완화 효과를 평가하였다. 투여군은 플라시보군 대비 VAS 점수가 40% 이상 감소하였으며, 혈중 Prostaglandin 수치 또한 유의하게 저하되었다. 이는 현부이경탕이 자궁 평활근 이완 및 염증 매개 물질 억제에 효과적임을 시사한다.",
            tags: ["생리통", "현부이경탕", "부인과"],
            originalUrl: "https://www.kci.go.kr/kciportal/main.kci"
        }
    ];

    // Filter mock papers if query exists
    const filteredMock = query
        ? mockPapers.filter(p => p.title.includes(query) || p.abstract.includes(query) || p.tags.some(t => t.includes(query)))
        : mockPapers;

    // Combine results (Priority: PubMed if searching)
    const combined = [...pubmedPapers, ...filteredMock];

    return NextResponse.json({ papers: combined });
}
