const https = require('https');

const query = 'acupuncture';

function fetchRaw(url) {
    return new Promise((resolve, reject) => {
        console.log(`\n--- Fetching: ${url.replace(/key=[^&]+/, 'key=***')} ---`);
        https.get(url, (res) => {
            console.log('Status Code:', res.statusCode);
            console.log('Headers:', JSON.stringify(res.headers, null, 2));

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

async function runTests() {
    const pubmedKey = '66df86272c0a3a5343fce385b43245c87808';
    const kciKey = '27263324';

    // 1. PubMed Full Flow
    try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json&retmax=3${pubmedKey ? `&api_key=${pubmedKey}` : ''}`;
        const searchBody = await fetchRaw(searchUrl);
        const searchData = JSON.parse(searchBody);
        const ids = searchData.esearchresult?.idlist || [];
        console.log('PubMed IDs:', ids);

        if (ids.length > 0) {
            const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${pubmedKey ? `&api_key=${pubmedKey}` : ''}`;
            const summaryBody = await fetchRaw(summaryUrl);
            console.log('PubMed Summary Body (first 500 chars):', summaryBody.substring(0, 500));
        }
    } catch (e) { console.error('PubMed Flow Error:', e.message); }

    // 2. KCI Search (Try HTTP instead of HTTPS)
    if (kciKey) {
        // Trying http:// instead of https:// for KCI as some government APIs prefer HTTP
        const kciUrl = `http://www.kci.go.kr/kciportal/openapi/kci_info.kci?key=${kciKey}&apiCode=articleSearch&keyword=${encodeURIComponent('한의학')}&displayCount=3`;
        try {
            // Need http module for http
            const http = require('http');
            console.log(`\n--- Fetching (HTTP): ${kciUrl.replace(/key=[^&]+/, 'key=***')} ---`);
            const body = await new Promise((resolve, reject) => {
                http.get(kciUrl, (res) => {
                    let data = '';
                    res.on('data', (c) => data += c);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            console.log('KCI Search Body (first 500 chars):', body.substring(0, 500));
        } catch (e) { console.error('KCI Search Error:', e.message); }
    }
}

runTests();
