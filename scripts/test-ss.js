
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testSemanticScholar() {
    const query = 'acupuncture';
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

    if (!apiKey) {
        console.error('❌ SEMANTIC_SCHOLAR_API_KEY not found in .env.local');
        return;
    }

    console.log(`🔍 Testing Semantic Scholar API with Key...`);

    const fields = 'title,url,abstract,venue,year,authors,citationCount';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=${fields}`;

    try {
        const res = await fetch(url, {
            headers: {
                'x-api-key': apiKey
            }
        });
        console.log(`📡 Status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const text = await res.text();
            console.error('❌ Fetch failed:', text);
            return;
        }

        const data = await res.json();
        console.log(`✅ Success: Found ${data.data?.length || 0} papers.`);
        if (data.data && data.data.length > 0) {
            console.log(`📄 First title: ${data.data[0].title}`);
        }

    } catch (err) {
        console.error('💥 Fatal Error:', err.message);
    }
}

testSemanticScholar();
