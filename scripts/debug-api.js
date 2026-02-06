const http = require('http');

const url = 'http://localhost:3005/api/papers?q=%EC%83%9D%EB%A6%AC%ED%86%B5&limit=5';

console.log('Fetching:', url);

http.get(url, (res) => {
    let data = '';

    console.log('Status Code:', res.statusCode);

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Papers count:', json.papers?.length);
            console.log('Meta:', JSON.stringify(json.meta, null, 2));
            if (json.papers?.length > 0) {
                console.log('First paper:', JSON.stringify(json.papers[0], null, 2));
            } else {
                console.log('No papers found.');
            }
        } catch (e) {
            console.error('Error parsing JSON:', e.message);
            console.log('Raw body:', data.substring(0, 500));
        }
    });

}).on('error', (err) => {
    console.error('Error:', err.message);
});
