const fetch = require('node-fetch');

async function testClinicalTrials() {
    const query = 'Acupuncture';
    const url = `http://localhost:3000/api/papers?q=${encodeURIComponent(query)}&sourceType=trials`;

    console.log(`[Test] Fetching clinical trials for: ${query}`);
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`[Test] Failed: ${res.status} ${res.statusText}`);
            return;
        }
        const data = await res.json();
        console.log(`[Test] Success! Found ${data.papers.length} trials.`);

        if (data.papers.length > 0) {
            console.log('[Test] First Trial Sample:');
            console.log(`- Title: ${data.papers[0].title}`);
            console.log(`- Status: ${data.papers[0].journal}`);
            console.log(`- Source: ${data.papers[0].source}`);
        }
    } catch (err) {
        console.error(`[Test] Error: ${err.message}`);
    }
}

testClinicalTrials();
