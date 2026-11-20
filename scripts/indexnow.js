// Submits all site URLs to the IndexNow protocol (supported by Microsoft Bing, Yandex, Seznam, Naver)
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'bench.progeni.live';
const KEY = 'c032a188f5724bc4935ef7a07525d886';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  console.error('sitemap.xml not found! Build the site first.');
  process.exit(1);
}

const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const urlMatches = [...sitemapContent.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map(m => m[1]);

if (!urlMatches.length) {
  console.error('No URLs found in sitemap.xml');
  process.exit(1);
}

console.log(`Submitting ${urlMatches.length} URLs to IndexNow for ${HOST}...`);

const payload = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urlMatches
});

const req = https.request('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`IndexNow Response: ${res.statusCode} ${res.statusMessage}`);
    if (body) console.log('Response body:', body);
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log('Successfully submitted all URLs to IndexNow!');
    } else {
      console.warn(`IndexNow responded with HTTP ${res.statusCode}.`);
    }
  });
});

req.on('error', err => {
  console.error('IndexNow submission error:', err.message);
});

req.write(payload);
req.end();
