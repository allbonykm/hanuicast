import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';

export function logToFile(msg: string) {
    try {
        fs.appendFileSync('api-debug.log', `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) { }
}

// ============================================================
// Types
// ============================================================

export interface Paper {
    id: string;
    title: string;
    authors: string;
    journal: string;
    date: string;
    abstract: string;
    tags: string[];
    originalUrl: string;
    source: 'PubMed' | 'KCI' | 'KampoDB' | 'J-STAGE' | 'Semantic Scholar';
    type?: string; // e.g. 'Case Report', 'Review', 'Clinical Trial'
}

export type SearchMode = 'clinical' | 'evidence' | 'latest' | 'general';

export interface SearchOptions {
    maxResults?: number;
    sort?: 'date' | 'relevance';
    minDate?: string;  // YYYY/MM/DD
    maxDate?: string;
    mode?: SearchMode;
    fullTextOnly?: boolean;
    category?: string;
}

const DEFAULT_OPTIONS: SearchOptions = {
    maxResults: 10,
    sort: 'date'
};

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 60000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'User-Agent': 'Hanuicast/1.0 (mailto:admin@hanuicast.com)'
            }
        });

        if (!response.ok && response.status === 404) {
            // Some APIs return 404 for 'no results', but we should at least not hang
            clearTimeout(timeout);
            return response;
        }

        return response;
    } catch (e: any) {
        if (e.name === 'AbortError') {
            throw new Error(`Timeout after ${timeoutMs}ms`);
        }
        throw e;
    } finally {
        // We DON'T clear timeout here if we want it to cover body reading too?
        // Actually, fetch signal covers the whole request including body if the stream is consumed.
        // But the user of this function might not consume the stream immediately.
        clearTimeout(timeout);
    }
}

// Mock Data for Fallback
const MOCK_PAPERS: Paper[] = [
    {
        id: 'mock_1',
        title: 'Acupuncture for Chronic Pain: A Randomized Clinical Trial',
        authors: 'Kim J, Lee S, Park H',
        journal: 'Journal of Korean Medicine',
        date: '2024/01/15',
        abstract: 'This study investigates the effects of acupuncture on chronic pain management...',
        tags: ['Acupuncture', 'Pain Management'],
        originalUrl: 'https://pubmed.ncbi.nlm.nih.gov/',
        source: 'PubMed'
    },
    {
        id: 'mock_2',
        title: 'Herbal Medicine (Bojungikgi-tang) for Fatigue: Systemic Review',
        authors: 'Choi M, Jeong Y',
        journal: 'Integrative Medicine Research',
        date: '2023/11/20',
        abstract: 'A systematic review of Bojungikgi-tang for treating chronic fatigue syndrome...',
        tags: ['Herbal Medicine', 'Fatigue'],
        originalUrl: 'https://www.kci.go.kr/',
        source: 'KCI'
    }
];

// ============================================================
// PubMed API
// ============================================================

export async function fetchPubmedPapers(
    query: string,
    options: SearchOptions = {}
): Promise<Paper[]> {
    if (!query) return [];

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const apiKey = process.env.PUBMED_API_KEY ? `&api_key=${process.env.PUBMED_API_KEY}` : '';
    let ids: string[] = [];

    try {
        // Step 1: ESearch - get IDs
        let searchTerms = query;

        // Apply mode-specific PubMed filters ([pt] = Publication Type)
        if (opts.mode === 'evidence') {
            searchTerms += ' AND ("meta-analysis"[pt] OR "systematic review"[pt])';
        } else if (opts.mode === 'clinical') {
            searchTerms += ' AND ("case reports"[pt] OR "clinical trial"[pt] OR "meta-analysis"[pt] OR "systematic review"[pt])';
        }

        // Apply Full-Text Filter
        if (opts.fullTextOnly) {
            searchTerms += ' AND ("free full text"[sb] OR "open access"[filter])';
        }

        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerms)}&retmode=json&retmax=${opts.maxResults}${apiKey}`;

        if (opts.sort === 'date') {
            searchUrl += '&sort=pub_date';
        }
        if (opts.minDate) {
            searchUrl += `&mindate=${opts.minDate}&datetype=pdat`;
        }
        if (opts.maxDate) {
            searchUrl += `&maxdate=${opts.maxDate}`;
        }

        logToFile(`[PubMed] Fetching ESearch: ${searchUrl.replace(apiKey, '&api_key=***')}`);
        const searchRes = await fetchWithTimeout(searchUrl); // Uses default 15s
        logToFile(`[PubMed] ESearch Status: ${searchRes.status}`);

        const searchData = await searchRes.json();
        logToFile(`[PubMed] ESearch Data: ${JSON.stringify(searchData)}`);

        ids = searchData.esearchresult?.idlist || [];
        logToFile(`[PubMed] Found IDs: ${ids.length} (${ids.join(',')})`);

        if (ids.length === 0) {
            logToFile(`[PubMed] No IDs found for query: ${query}`);
            return [];
        }

        // Step 2: EFetch - Fetch full details + Abstract (XML)
        // Switch to BATCH EFetch for efficiency and avoiding rate limits
        logToFile(`[PubMed] Fetching ${ids.length} details via Batch EFetch (XML)...`);

        const batchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=abstract&retmode=xml${apiKey}`;
        const res = await fetchWithTimeout(batchUrl, 30000); // 30s for the whole batch
        if (!res.ok) {
            logToFile(`[PubMed] Batch EFetch failed: ${res.status}`);
            throw new Error(`Batch EFetch failed with status ${res.status}`);
        }

        const xmlText = await res.text();
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
        const parsed = parser.parse(xmlText);

        const articleSet = parsed.PubmedArticleSet;
        const articles = articleSet?.PubmedArticle
            ? (Array.isArray(articleSet.PubmedArticle) ? articleSet.PubmedArticle : [articleSet.PubmedArticle])
            : [];

        const results: Paper[] = articles.map((articleData: any) => {
            const article = articleData.MedlineCitation?.Article;
            const pmid = articleData.MedlineCitation?.PMID?.['#text'] || articleData.MedlineCitation?.PMID || 'unknown';

            if (!article) {
                return {
                    id: `pubmed_${pmid}`,
                    title: `[PubMed] 상세 정보를 가져올 수 없습니다 (ID: ${pmid})`,
                    authors: 'N/A',
                    journal: 'PubMed',
                    date: 'Unknown',
                    abstract: '상세 정보를 불러오는 중 데이터 구조가 예상과 달랐습니다.',
                    tags: ['PubMed'],
                    originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                    source: 'PubMed' as const
                };
            }

            // Authors
            let authorStr = 'Unknown Authors';
            if (article.AuthorList?.Author) {
                const authors = Array.isArray(article.AuthorList.Author)
                    ? article.AuthorList.Author
                    : [article.AuthorList.Author];
                authorStr = authors.map((a: any) => `${flattenText(a.LastName) || ''} ${flattenText(a.Initials) || ''}`.trim()).join(', ');
            }

            // Date
            let dateStr = 'Unknown Date';
            const pubDate = article.Journal?.JournalIssue?.PubDate;
            if (pubDate) {
                dateStr = `${flattenText(pubDate.Year) || ''} ${flattenText(pubDate.Month) || ''}`.trim();
            }

            // Abstract
            let abstractText = 'No abstract available.';
            if (article.Abstract?.AbstractText) {
                abstractText = flattenText(article.Abstract.AbstractText);
                // Fix: Remove artifacts like "P P P P P P" that appear in some PubMed abstracts
                abstractText = abstractText.replace(/(\s*P){3,}\s*/g, ' ').trim();
            }

            // Publication Type
            let type = 'Journal Article';
            if (article.PublicationTypeList?.PublicationType) {
                const pts = Array.isArray(article.PublicationTypeList.PublicationType)
                    ? article.PublicationTypeList.PublicationType
                    : [article.PublicationTypeList.PublicationType];
                const priorityTypes = ['Meta-Analysis', 'Systematic Review', 'Clinical Trial', 'Case Reports', 'Review'];
                const found = pts.map((pt: any) => flattenText(pt)).find((pt: string) => priorityTypes.includes(pt));
                type = found || flattenText(pts[0]);
            }

            return {
                id: `pubmed_${pmid}`,
                title: flattenText(article.ArticleTitle) || 'Untitled',
                authors: authorStr,
                journal: flattenText(article.Journal?.Title) || 'Unknown Journal',
                date: dateStr,
                abstract: abstractText,
                tags: ['PubMed'],
                originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                source: 'PubMed' as const,
                type: type
            };
        });

        // Ensure we return exactly what ESearch found (even if empty placeholders)
        // but EFetch usually returns what it finds.
        logToFile(`[PubMed] Returning ${results.length} papers.`);
        return results;

    } catch (error: any) {
        logToFile(`[PubMed] Fatal Error: ${error.message}\n${error.stack}`);
        console.error('[PubMed] Fetch error:', error);

        // If we already have IDs, return placeholders instead of giving up entirely
        if (typeof ids !== 'undefined' && ids.length > 0) {
            logToFile(`[PubMed] Returning initial IDs as search failed mid-way.`);
            return ids.map((id: string) => ({
                id: `pubmed_${id}`,
                title: `PubMed Article (ID: ${id})`,
                authors: 'Details unavailable',
                journal: 'PubMed',
                date: 'Unknown',
                abstract: `[PubMed ID: ${id}] Failed to load details due to timeout.`,
                tags: ['PubMed'],
                originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                source: 'PubMed'
            }));
        }
        return [];
    }
}

export async function fetchPubmedAbstract(pmid: string): Promise<string | null> {
    const apiKey = process.env.PUBMED_API_KEY ? `&api_key=${process.env.PUBMED_API_KEY}` : '';

    try {
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text${apiKey}`;
        const res = await fetchWithTimeout(url); // Uses default 15s
        const text = await res.text();
        return text.trim() || null;
    } catch (error) {
        console.error('[PubMed] Abstract fetch error:', error);
        return null;
    }
}

// ============================================================
// KCI API
// ============================================================

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
});

/**
 * HTML 엔티티 (예: &#x2009;, &nbsp;, &lt; 등)를 일반 텍스트로 복원합니다.
 */
export function decodeEntities(text: string): string {
    if (!text) return '';
    return text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&apos;/g, "'");
}

/**
 * XML 파싱 결과로 생성된 객체/배열을 평면 문자열로 변환합니다.
 * 태그(sup, sub 등)가 포함된 경우에도 텍스트만 추출하여 React 렌더링 오류를 방지하며,
 * 특수 문자 인코딩 문제(글자 깨짐)를 해결하기 위해 디코딩을 수행합니다.
 */
export function flattenText(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return decodeEntities(val);
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) {
        return val.map(flattenText).join(' ').trim();
    }
    if (typeof val === 'object') {
        let text = '';
        if (val['#text'] !== undefined) {
            text += flattenText(val['#text']);
        }
        for (const key of Object.keys(val)) {
            if (key === '#text' || key.startsWith('@_')) continue;
            const childText = flattenText(val[key]);
            if (childText) {
                text += (text ? ' ' : '') + childText;
            }
        }
        return text.trim();
    }
    return '';
}

export async function fetchKciPapers(
    query: string,
    options: SearchOptions = {}
): Promise<Paper[]> {
    if (!query) return [];

    const apiKey = process.env.KCI_API_KEY;
    if (!apiKey) {
        console.warn('[KCI] API key not found');
        return [];
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        // Correct URL based on PDF: open.kci.go.kr
        const url = `https://open.kci.go.kr/po/openapi/openApiSearch.kci?key=${apiKey}&apiCode=articleSearch&keyword=${encodeURIComponent(query)}&displayCount=${opts.maxResults}`;

        logToFile(`[KCI] Fetching: ${url.replace(apiKey, '***')}`);
        const res = await fetchWithTimeout(url); // Uses default 15s
        logToFile(`[KCI] Status: ${res.status}`);

        if (!res.ok) {
            const body = await res.text();
            logToFile(`[KCI] Error Body: ${body.substring(0, 200)}`);
            return [];
        }

        const xmlText = await res.text();
        const data = xmlParser.parse(xmlText);

        // KCI XML structure: <MetaData> <outputData> <record> ...
        let records = data?.MetaData?.outputData?.record || data?.result?.outputData?.record;

        if (!records) {
            logToFile(`[KCI] No records found in response`);
            return [];
        }

        const recordList = Array.isArray(records) ? records : [records];

        return recordList.map((record: any) => {
            const articleInfo = record.articleInfo || {};
            const journalInfo = record.journalInfo || {};

            // Safe extraction helper (Now uses flattenText)
            const getText = (val: any) => flattenText(val);

            const articleId = articleInfo['@_article-id'] || record.articleId || record.id || Math.random().toString(36).substring(7);
            const titleGroup = articleInfo['title-group'] || {};
            let title = getText(titleGroup['article-title'] || record.title || 'Untitled');
            title = title.replace(/회전근\s+개/g, '회전근개');

            let authors = 'Unknown Authors';
            const authorGroup = articleInfo['author-group'];
            if (authorGroup?.author) {
                const authorList = Array.isArray(authorGroup.author) ? authorGroup.author : [authorGroup.author];
                authors = authorList.map((a: any) => getText(a.name || a)).filter(Boolean).join(', ');
            } else {
                authors = getText(record.authorName) || 'Unknown Authors';
            }

            const journal = getText(journalInfo['journal-name'] || record.journalName || 'Unknown Journal');
            const pubYear = getText(journalInfo['pub-year'] || record.pubYear || 'Unknown Date');

            let abstract = '';
            const abstractGroup = articleInfo['abstract-group'];
            if (abstractGroup?.abstract) {
                const absList = Array.isArray(abstractGroup.abstract) ? abstractGroup.abstract : [abstractGroup.abstract];
                // Prefer Korean
                const korAbs = absList.find((a: any) => a['@_lang'] === 'original' || a['@_lang'] === 'korean');
                abstract = getText(korAbs || absList[0]);
                abstract = abstract.replace(/회전근\s+개/g, '회전근개');
            }

            // Determine KCI Type (Simplified mapping)
            let type = 'Journal Article';
            if (articleInfo['article-categories']?.['subj-group']?.['subject']) {
                const sub = getText(articleInfo['article-categories']['subj-group']['subject']);
                if (sub.includes('사례') || sub.includes('증례')) type = 'Case Report';
                else if (sub.includes('리뷰') || sub.includes('검토')) type = 'Review';
            }

            return {
                id: `kci_${articleId}`,
                title,
                authors: authors || 'Unknown Authors',
                journal: journal || 'Unknown Journal',
                date: pubYear || 'Unknown Date',
                abstract: abstract || `[KCI Article] Click to view details.`,
                tags: ['KCI'],
                originalUrl: `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${articleId}`,
                source: 'KCI' as const,
                type
            };
        });

    } catch (error: any) {
        logToFile(`[KCI] Fatal Error: ${error.message}\n${error.stack}`);
        console.error('[KCI] Fetch error:', error);
        return [];
    }
}

export async function fetchKciAbstract(articleId: string): Promise<string | null> {
    const apiKey = process.env.KCI_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://open.kci.go.kr/po/openapi/openApiSearch.kci?key=${apiKey}&apiCode=articleDetail&id=${articleId}`;
        const res = await fetchWithTimeout(url); // Uses default 15s
        if (!res.ok) return null;

        const xmlText = await res.text();
        const data = xmlParser.parse(xmlText);

        const record = data?.MetaData?.outputData?.record;
        if (!record) return null;

        const articleInfo = record.articleInfo || {};
        const abstractGroup = articleInfo['abstract-group'];
        if (abstractGroup?.abstract) {
            const absList = Array.isArray(abstractGroup.abstract) ? abstractGroup.abstract : [abstractGroup.abstract];
            const korAbs = absList.find((a: any) => a['@_lang'] === 'original' || a['@_lang'] === 'korean');
            return flattenText(korAbs || absList[0]);
        }
        return null;
    } catch (error) {
        console.error('[KCI] Abstract fetch error:', error);
        return null;
    }
}

// ============================================================
// KampoDB API
// ============================================================

export async function fetchKampoPapers(
    formulaIds: string[]
): Promise<Paper[]> {
    if (!formulaIds || formulaIds.length === 0) return [];

    try {
        logToFile(`[KampoDB] Fetching details for IDs: ${formulaIds.join(', ')}`);

        const paperPromises = formulaIds.map(async (id) => {
            return fetchKampoFormulaDetails(id);
        });

        const results = await Promise.all(paperPromises);
        return results.filter((p): p is Paper => p !== null);
    } catch (error: any) {
        logToFile(`[KampoDB] Error: ${error.message}`);
        return [];
    }
}

async function fetchKampoFormulaDetails(id: string): Promise<Paper | null> {
    try {
        // 1. Basic Info
        const infoUrl = `https://wakanmoview.inm.u-toyama.ac.jp/kampo/api/formula/${id}/info`;
        const crudeUrl = `https://wakanmoview.inm.u-toyama.ac.jp/kampo/api/formula/${id}/crude`;
        const diseaseUrl = `https://wakanmoview.inm.u-toyama.ac.jp/kampo/api/formula/${id}/disease`;

        const [infoRes, crudeRes, diseaseRes] = await Promise.all([
            fetchWithTimeout(infoUrl),
            fetchWithTimeout(crudeUrl),
            fetchWithTimeout(diseaseUrl)
        ]);

        if (!infoRes.ok) return null;

        const info = await infoRes.json();
        const crudes = crudeRes.ok ? await crudeRes.json() : [];
        const diseases = diseaseRes.ok ? await diseaseRes.json() : [];

        // Build Title
        const title = `[한방] ${info.name} (${info.name_jp})`;

        // Build Abstract (Crudes + Top Diseases)
        const crudeList = Array.isArray(crudes) ? crudes.map((c: any) => c.name).join(', ') : '';
        const diseaseList = Array.isArray(diseases) ? diseases.slice(0, 5).map((d: any) => d.name).join(', ') : '';

        let abstract = `[구성 약재] ${crudeList || '정보 없음'}\n\n`;
        abstract += `[주요 적응증/활성] ${diseaseList || '정보 없음'}\n\n`;
        abstract += `* KampoDB 데이터를 기반으로 생성된 정보입니다. 상세 기전 및 근거는 KampoDB 홈페이지에서 확인할 수 있습니다.`;

        return {
            id: `kampodb_${id}`,
            title,
            authors: 'Toyama University (KampoDB)',
            journal: 'KampoDB (WAKAN-YAKU Research)',
            date: new Date().toLocaleDateString('ja-JP'), // Latest info
            abstract,
            tags: ['Kampo', 'Traditional Medicine'],
            originalUrl: `https://wakanmoview.inm.u-toyama.ac.jp/kampo/formula/${id}`,
            source: 'KampoDB',
            type: 'Formula'
        };
    } catch (error) {
        console.error(`[KampoDB] Failed to fetch details for ${id}:`, error);
        return null;
    }
}

// ============================================================
// J-STAGE API
// ============================================================

export async function fetchJStagePapers(
    query: string,
    options: SearchOptions = {}
): Promise<Paper[]> {
    if (!query) return [];

    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        // service 3 = article search, count = results
        const url = `https://api.jstage.jst.go.jp/searchapi/do?service=3&keyword=${encodeURIComponent(query)}&count=${opts.maxResults}`;

        logToFile(`[J-STAGE] Fetching: ${url}`);
        const res = await fetchWithTimeout(url);

        if (!res.ok) {
            logToFile(`[J-STAGE] Fetch failed: ${res.statusText}`);
            return [];
        }

        const xmlText = await res.text();
        const data = xmlParser.parse(xmlText);

        const entries = data?.feed?.entry;
        if (!entries) return [];

        const entryList = Array.isArray(entries) ? entries : [entries];

        return entryList.map((entry: any) => {
            const getText = (val: any) => flattenText(val);

            const titleEn = getText(entry.article_title?.en || entry.title);
            const titleJa = getText(entry.article_title?.ja);
            const title = titleEn || titleJa || 'Untitled';

            const entryId = getText(entry.id) || getText(entry.link?.['@_href']) || getText(entry.article_link?.en);
            const shortId = entryId.split('/').filter(Boolean).pop() || Math.random().toString(36).substring(7);

            let authors = 'Unknown Authors';
            const authorData = entry.author?.en || entry.author?.ja || entry.author;
            if (authorData) {
                const authorNodes = Array.isArray(authorData) ? authorData : [authorData];
                const names = authorNodes.flatMap((a: any) => {
                    const n = a.name;
                    if (Array.isArray(n)) return n.map(getText);
                    return [getText(n)];
                }).filter(Boolean);
                if (names.length > 0) authors = names.join(', ');
            }

            const journal = getText(entry.material_title?.en || entry.material_title?.ja || entry['prism:publicationName'] || 'J-STAGE');
            const pubDate = getText(entry.pubyear || entry['prism:publicationDate'] || entry.updated || 'Unknown Date');

            return {
                id: `jstage_${shortId}`,
                title: title,
                authors: authors,
                journal: journal,
                date: String(pubDate),
                abstract: `[JP] ${titleJa || 'N/A'}\n[EN] ${titleEn || 'N/A'}`,
                tags: ['J-STAGE'],
                originalUrl: entryId || `https://www.jstage.jst.go.jp/article/`,
                source: 'J-STAGE' as const,
                type: 'Journal Article'
            };
        });

    } catch (error: any) {
        logToFile(`[J-STAGE] Fatal Error: ${error.message}`);
        return [];
    }
}

// ============================================================
// Semantic Scholar API
// ============================================================

export async function fetchSemanticScholarPapers(
    query: string,
    options: SearchOptions = {}
): Promise<Paper[]> {
    if (!query) return [];

    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const fields = 'title,url,abstract,venue,year,authors,citationCount';
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${opts.maxResults}&fields=${fields}`;

        logToFile(`[Semantic Scholar] Fetching: ${url}`);
        const res = await fetchWithTimeout(url);

        if (!res.ok) {
            logToFile(`[Semantic Scholar] Fetch failed: ${res.statusText}`);
            return [];
        }

        const data = await res.json();
        const papers = data.data;

        if (!papers || !Array.isArray(papers)) return [];

        return papers.map((p: any) => {
            const authors = p.authors?.map((a: any) => a.name).join(', ') || 'Unknown Authors';

            return {
                id: `semanticscholar_${p.paperId}`,
                title: p.title || 'Untitled',
                authors: authors,
                journal: p.venue || 'Semantic Scholar',
                date: String(p.year || 'Unknown Date'),
                abstract: p.abstract || '[AI Search Result] Abstract not available in search snippet.',
                tags: ['AI-Recommended'],
                originalUrl: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
                source: 'Semantic Scholar' as const,
                type: 'Scholarly Article'
            };
        });

    } catch (error: any) {
        logToFile(`[Semantic Scholar] Fatal Error: ${error.message}`);
        return [];
    }
}
