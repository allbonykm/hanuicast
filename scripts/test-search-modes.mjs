// Test script for Search Modes
// Run with: node scripts/test-search-modes.mjs

const BASE_URL = 'http://localhost:3005';

async function testMode(query, mode) {
    console.log(`\n--- Testing Mode: ${mode} ---`);
    console.log(`Query: ${query}`);

    try {
        const res = await fetch(`${BASE_URL}/api/papers?q=${encodeURIComponent(query)}&mode=${mode}&limit=3`);
        const data = await res.json();

        console.log(`PubMed Count: ${data.meta?.pubmedCount}`);
        console.log(`Translated Query: ${data.meta?.translatedQuery || 'None'}`);

        if (data.papers && data.papers.length > 0) {
            data.papers.forEach((p, i) => {
                console.log(`${i + 1}. [${p.source}] [Type: ${p.type || 'N/A'}] ${p.title.substring(0, 70)}...`);
            });
        } else {
            console.log('No results.');
        }
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

async function run() {
    console.log('Verifying Search Modes API...');

    // 1. Evidence mode
    await testMode('우울증', 'evidence');

    // 2. Clinical mode
    await testMode('침 치료', 'clinical');

    // 3. Latest mode
    await testMode('한방 다이어트', 'latest');
}

run();
