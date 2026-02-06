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
    source: 'PubMed' | 'KCI';
}

export interface SearchOptions {
    maxResults?: number;
    sort?: 'date' | 'relevance';
    minDate?: string;  // YYYY/MM/DD
    maxDate?: string;
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
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${opts.maxResults}${apiKey}`;

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
        // ESummary is blocked/throttled, so we use EFetch which is verified to work
        logToFile(`[PubMed] Fetching ${ids.length} details via EFetch (XML)...`);

        const summaryPromises = ids.map(async (id) => {
            try {
                // Use EFetch with XML to get full metadata + abstract
                // Note: rettype=abstract, retmode=xml gives the standard PubMed XML format
                const individualUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${id}&rettype=abstract&retmode=xml${apiKey}`;

                const res = await fetchWithTimeout(individualUrl, 20000); // 20s for full XML
                if (!res.ok) return { id, data: null };

                const xmlText = await res.text();
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    attributeNamePrefix: "@_"
                });
                const parsed = parser.parse(xmlText);

                // PubMed XML structure navigation
                // When fetching single ID, PubmedArticle is an object. If multiple, it's array.
                // We are fetching individually here.
                const articleSet = parsed.PubmedArticleSet;
                const article = articleSet?.PubmedArticle?.MedlineCitation?.Article;

                if (!article) return { id, data: null };

                // Authors
                let authorStr = 'Unknown Authors';
                if (article.AuthorList?.Author) {
                    const authors = Array.isArray(article.AuthorList.Author)
                        ? article.AuthorList.Author
                        : [article.AuthorList.Author];
                    authorStr = authors.map((a: any) => `${a.LastName || ''} ${a.Initials || ''}`.trim()).join(', ');
                }

                // Date
                let dateStr = 'Unknown Date';
                const pubDate = article.Journal?.JournalIssue?.PubDate;
                if (pubDate) {
                    dateStr = `${pubDate.Year || ''} ${pubDate.Month || ''}`.trim();
                }

                // Abstract
                let abstractText = 'No abstract available.';
                if (article.Abstract?.AbstractText) {
                    const abs = article.Abstract.AbstractText;
                    abstractText = Array.isArray(abs) ? abs.map((t: any) => typeof t === 'string' ? t : t['#text']).join(' ') : (typeof abs === 'string' ? abs : abs['#text']);
                }

                const item = {
                    title: article.ArticleTitle || 'Untitled',
                    authors: authorStr,
                    fulljournalname: article.Journal?.Title || 'Unknown Journal',
                    pubdate: dateStr,
                    abstract: abstractText
                };

                return { id, data: item };

            } catch (e) {
                logToFile(`[PubMed] EFetch failed for ID ${id}: ${e}`);
                return { id, data: null };
            }
        });

        const summaryResults = await Promise.all(summaryPromises);

        const results = summaryResults.map(res => {
            if (!res || !res.data) {
                // Return minimal info for failed items instead of placeholder title
                const id = res?.id || 'unknown';
                return {
                    id: `pubmed_${id}`,
                    title: `[PubMed] 상세 정보를 가져올 수 없습니다 (ID: ${id})`,
                    authors: 'N/A',
                    journal: 'PubMed',
                    date: 'Unknown',
                    abstract: '상세 정보를 불러오는 중 타임아웃이 발생했습니다.',
                    tags: ['PubMed'],
                    originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                    source: 'PubMed' as const
                };
            }

            const item = res.data;
            return {
                id: `pubmed_${res.id}`,
                title: item.title || 'Untitled',
                authors: item.authors || 'Unknown Authors',
                journal: item.fulljournalname || 'Unknown Journal',
                date: item.pubdate || 'Unknown Date',
                abstract: item.abstract || `[PubMed ID: ${res.id}] Abstract not available.`,
                tags: ['PubMed'],
                originalUrl: `https://pubmed.ncbi.nlm.nih.gov/${res.id}/`,
                source: 'PubMed' as const
            };
        });

        logToFile(`[PubMed] Returning ${results.length} papers.`);
        return results;

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
                title: `PubMed Artice (ID: ${id})`,
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

            // Safe extraction helper
            const getText = (val: any) => {
                if (!val) return '';
                if (typeof val === 'string') return val;
                if (val['#text']) return val['#text'];
                if (Array.isArray(val)) return getText(val[0]);
                return '';
            };

            const articleId = articleInfo['@_article-id'] || record.articleId || record.id || Math.random().toString(36).substring(7);
            const titleGroup = articleInfo['title-group'] || {};
            const title = getText(titleGroup['article-title'] || record.title || 'Untitled');

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
                source: 'KCI' as const
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
            return korAbs ? (korAbs['#text'] || korAbs) : (absList[0]['#text'] || absList[0]);
        }
        return null;
    } catch (error) {
        console.error('[KCI] Abstract fetch error:', error);
        return null;
    }
}
