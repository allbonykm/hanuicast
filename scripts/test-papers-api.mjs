// Test script for Papers API
// Run with: node scripts/test-papers-api.mjs

const BASE_URL = 'http://localhost:3005';

async function testSearch(query, label) {
    console.log(`\n=== ${label} ===`);
    console.log(`Query: "${query}"`);

    try {
        const res = await fetch(`${BASE_URL}/api/papers?q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();

        console.log(`Total results: ${data.meta?.totalCount || 0}`);
        console.log(`PubMed: ${data.meta?.pubmedCount || 0}, KCI: ${data.meta?.kciCount || 0}`);

        if (data.meta?.translatedQuery) {
            console.log(`Translated query: "${data.meta.translatedQuery}"`);
        }

        if (data.papers?.length > 0) {
            console.log('\nTop results:');
            data.papers.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i + 1}. [${p.source}] ${p.title.substring(0, 60)}...`);
            });
        }

        return data;
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function testAbstract(id) {
    console.log(`\n=== Abstract Test: ${id} ===`);

    try {
        const res = await fetch(`${BASE_URL}/api/papers/abstract?id=${id}`);
        const data = await res.json();

        if (data.abstract) {
            console.log(`Abstract (first 200 chars): ${data.abstract.substring(0, 200)}...`);
        } else {
            console.log('No abstract found:', data.error);
        }

        return data;
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function main() {
    console.log('Papers API Test Suite\n');
    console.log(`Testing against: ${BASE_URL}`);

    // Test 1: Korean query (should hit both KCI and PubMed)
    const koreanResult = await testSearch('한의학', 'Korean Query Test');

    // Test 2: English query (mainly PubMed)
    const englishResult = await testSearch('acupuncture', 'English Query Test');

    // Test 3: Specific Korean medical term
    await testSearch('보중익기탕', 'Traditional Medicine Term Test');

    // Test 4: Abstract retrieval (if we got results)
    if (koreanResult?.papers?.length > 0) {
        const firstPaper = koreanResult.papers[0];
        await testAbstract(firstPaper.id);
    }

    console.log('\n=== Tests Complete ===');
}

main().catch(console.error);
