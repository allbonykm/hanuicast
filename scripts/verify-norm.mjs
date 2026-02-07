// Custom test for rotator cuff normalization
const BASE_URL = 'http://localhost:3005';

async function verifyNormalization() {
    console.log('Verifying "회전근 개" -> "회전근개" normalization...');
    try {
        const res = await fetch(`${BASE_URL}/api/papers?q=${encodeURIComponent('회전근 개')}&mode=general&limit=5`);
        const data = await res.json();

        if (data.papers) {
            data.papers.forEach(p => {
                if (p.source === 'KCI') {
                    console.log(`[KCI Title] ${p.title}`);
                    if (p.title.includes('회전근 개')) {
                        console.error('FAILED: Found non-normalized "회전근 개"');
                    } else if (p.title.includes('회전근개')) {
                        console.log('SUCCESS: Normalized to "회전근개"');
                    }
                }
            });
        }
    } catch (e) {
        console.error(e);
    }
}

verifyNormalization();
