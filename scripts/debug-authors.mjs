// Debug KCI author extraction
const BASE_URL = 'http://localhost:3005';

async function debugAuthors() {
    console.log('Fetching papers to inspect author data...');
    try {
        const res = await fetch(`${BASE_URL}/api/papers?q=${encodeURIComponent('회전근개')}&mode=general&limit=10`);
        const data = await res.json();

        if (data.papers) {
            data.papers.forEach((p, i) => {
                if (p.source === 'KCI') {
                    console.log(`\n[Paper ${i + 1}]`);
                    console.log(`  Title: ${p.title.substring(0, 50)}...`);
                    console.log(`  Authors: ${p.authors}`);
                    console.log(`  Authors Length: ${p.authors?.length || 0}`);
                }
            });
        }
    } catch (e) {
        console.error(e);
    }
}

debugAuthors();
