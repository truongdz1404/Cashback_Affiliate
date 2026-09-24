require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const cookiePath = path.join(__dirname, '..', 'storage', 'session-cookie.txt');

if (!fs.existsSync(cookiePath)) {
  console.error(`No cookie file at ${cookiePath}. Paste your raw "name=value; ..." cookie string into that file first.`);
  process.exit(1);
}

const cookies = fs.readFileSync(cookiePath, 'utf8').trim();
const port = process.env.PORT || 4000;
const apiKey = process.env.SERVICE_API_KEY;

if (!apiKey || apiKey === 'change-me') {
  console.error('Set SERVICE_API_KEY in .env first (must match what server.js is using).');
  process.exit(1);
}

fetch(`http://localhost:${port}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({ cookies }),
})
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
  .then(({ status, body }) => {
    console.log(`HTTP ${status}`);
    console.log(JSON.stringify(body, null, 2));
    if (status !== 200) process.exit(1);
  })
  .catch((err) => {
    console.error('Could not reach the service - is `npm start` running in another terminal?');
    console.error(err.message);
    process.exit(1);
  });
