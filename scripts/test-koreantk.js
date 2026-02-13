
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testKoreanTK() {
    const query = '인삼'; // Ginseng
    const serviceKey = process.env.KOREAN_TK_API_KEY;

    if (!serviceKey) {
        console.error('❌ KOREAN_TK_API_KEY not found in .env.local');
        return;
    }

    console.log(`🔍 Testing KoreanTK API with query: ${query}...`);

    // Using a simple fetch to simulate the logic in paperSources.ts
    const url = `https://apis.data.go.kr/1130000/TraditionalKnowledgePortal/getPaperSearch?serviceKey=${serviceKey}&keyword=${encodeURIComponent(query)}&numOfRows=5&pageNo=1`;

    try {
        const res = await fetch(url);
        console.log(`📡 Status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const text = await res.text();
            console.error('❌ Fetch failed:', text);
            return;
        }

        const xml = await res.text();
        console.log('📄 Response XML snippet:', xml.substring(0, 500), '...');

        if (xml.includes('<item>')) {
            console.log('✅ Success: Found <item> tags in response.');
        } else if (xml.includes('<totalCount>0</totalCount>')) {
            console.log('⚠️ No results found for this query.');
        } else {
            console.log('❓ Unexpected response structure. Check the XML above.');
        }

    } catch (err) {
        console.error('💥 Fatal Error:', err.message);
    }
}

testKoreanTK();
