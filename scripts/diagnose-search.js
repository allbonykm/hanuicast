
const { XMLParser } = require('fast-xml-parser');

async function fetchWithTimeout(url, timeoutMs = 60000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

function flattenText(val) {
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(flattenText).join(' ');
    if (typeof val === 'object') {
        if (val['#text'] !== undefined) return val['#text'];
        return JSON.stringify(val);
    }
    return '';
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

async function testJStage(query) {
    const url = `https://api.jstage.jst.go.jp/searchapi/do?service=3&keyword=${encodeURIComponent(query)}&count=2`;
    console.log(`[J-STAGE] URL: ${url}`);
    try {
        const res = await fetchWithTimeout(url);
        const xml = await res.text();
        const data = parser.parse(xml);
        const entries = data.feed?.entry;
        const entryList = Array.isArray(entries) ? entries : [entries];

        console.log(`[J-STAGE] Found ${entryList.length} entries`);
        entryList.forEach((entry, i) => {
            console.log(`\n--- Entry ${i} ---`);
            console.log(`Raw Title:`, entry.title);
            console.log(`Raw Article Title:`, entry.article_title);
            console.log(`Flattened Title:`, flattenText(entry.article_title?.en || entry.title));
            console.log(`Journal:`, entry.material_title);
        });
    } catch (e) {
        console.error('[J-STAGE] Error:', e.message);
    }
}

async function testSS(query) {
    const fields = 'title,url,abstract,venue,year,authors,citationCount';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=2&fields=${fields}`;
    console.log(`\n[Semantic Scholar] URL: ${url}`);
    try {
        const res = await fetchWithTimeout(url);
        const data = await res.json();
        console.log(`[Semantic Scholar] Found ${data.data?.length || 0} papers`);
        if (data.data) {
            data.data.forEach((p, i) => console.log(` - ${p.title}`));
        } else {
            console.log('Body:', JSON.stringify(data));
        }
    } catch (e) {
        console.error('[Semantic Scholar] Error:', e.message);
    }
}


async function testGemini(query) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[Gemini] API Key missing');
        return;
    }
    console.log(`\n[Gemini] Testing query: ${query}`);
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `User Query: "${query}". Task: Suggest relevant Kampo Formula IDs (e.g., KT-1). Output JSON: { "kampoIds": ["ID1", "ID2"] }`;
    try {
        const result = await model.generateContent(prompt);
        console.log(`[Gemini] Result:`, result.response.text());
    } catch (e) {
        console.error('[Gemini] Error:', e.message);
    }
}

// Test queries
(async () => {
    const q = 'acupuncture';
    await testJStage(q);
    // await testSS(q); // Skip 429 known issue
    await testGemini('시호제');
})();
