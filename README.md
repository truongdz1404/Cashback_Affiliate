# Shopee Affiliate Automation (n8n + Playwright)

Automates two things on `affiliate.shopee.vn` using your own logged-in session:

1. **Login** — injects your exported session cookies into a real Chromium browser (Playwright), so the site's own JS generates all the anti-bot headers (`af-ac-enc-dat`, `csrf-token`, ...) naturally. No password is ever entered or stored.
2. **Custom Link** — fills the [Custom Link](https://affiliate.shopee.vn/offer/custom_link) form and returns the generated affiliate link(s).
3. **Commission lookup** — opens `https://affiliate.shopee.vn/offer/product_offer/{pid}`, intercepts the page's own `GET /api/v3/offer/product?item_id={pid}` call, and scrapes the on-screen commission table (Loại kênh / Hoa hồng Xtra % / Hoa hồng từ Shopee % / Hoa hồng ước tính ₫).

n8n never talks to Shopee directly — it calls a small local **Playwright microservice** over HTTP, which does the actual browser automation.

```
shopee-affiliate-automation/
├── playwright-service/     Node.js + Express + Playwright
│   ├── server.js            HTTP API: /login /status /custom-link /commission/:pid
│   ├── lib/browserManager.js  cookie injection, session persistence
│   ├── lib/customLink.js
│   └── lib/commission.js
└── n8n/shopee-affiliate-workflow.json   importable n8n workflow
```

## 1. Set up the Playwright service

```bash
cd shopee-affiliate-automation/playwright-service
npm install
npx playwright install chromium
copy .env.example .env
```

Edit `.env`:
- `SERVICE_API_KEY` — pick any random string; you'll paste the same value into the n8n workflow's **Config** node.
- `HEADLESS=false` while you're first testing, so you can watch the browser and confirm selectors work; switch to `true` once it's stable.

Start it:

```bash
npm start
```

## 2. Get your session cookies

1. In your normal Chrome, log into `affiliate.shopee.vn`.
2. DevTools → Application → Cookies → `https://affiliate.shopee.vn`.
3. Easiest: install a "cookie export" extension (e.g. *EditThisCookie*, *Cookie-Editor*) and export as **JSON** for the `shopee.vn` domain.
4. Or just copy the raw `Cookie:` header value from a request in the Network tab (Copy → Copy as cURL) — the service also accepts that as a plain `"name1=value1; name2=value2"` string.

Test login directly against the service first. Two ways:

- **Curl**, pasting cookies inline:
  ```bash
  curl -X POST http://localhost:4000/login \
    -H "x-api-key: <your SERVICE_API_KEY>" \
    -H "Content-Type: application/json" \
    -d '{"cookies": [{"name":"SPC_EC","value":"...","domain":".shopee.vn"}, ...]}'
  ```
- **From a file** (recommended so the raw cookie string never has to be typed into a terminal command/shell history): paste your `name1=value1; name2=value2; ...` cookie string into `playwright-service/storage/session-cookie.txt` (already gitignored - never commit it, it's equivalent to your login session), then:
  ```bash
  npm run seed-login
  ```

A `{"loggedIn": true, ...}` response means it worked. The session is persisted to `playwright-service/storage/storageState.json`, so you don't need to log in again on every call — only when cookies expire.

**If `/login` fails or later calls redirect to a captcha page** (`.../verify/captcha?...&scene=crawler_item`): that's Shopee Shield's headless-browser detection, unrelated to whether the cookie itself is valid. Set `HEADLESS=false` in `.env` first and retest - a visible Chromium window is far less likely to be fingerprinted as a crawler than the default headless mode.

Quick smoke test of the other two endpoints:

```bash
curl -X POST http://localhost:4000/custom-link \
  -H "x-api-key: <key>" -H "Content-Type: application/json" \
  -d '{"links": ["https://shopee.vn/product/xxx/23552060269"]}'

curl http://localhost:4000/commission/23552060269 -H "x-api-key: <key>"
```

## 3. Import the n8n workflow

1. n8n → **Import from File** → `n8n/shopee-affiliate-workflow.json`.
2. Open the **Config** node and set:
   - `serviceUrl` → where the Playwright service is reachable from n8n (`http://localhost:4000`, or the container/host address if n8n runs in Docker — see note below).
   - `apiKey` → same value as `SERVICE_API_KEY` in `.env`.
3. Activate the workflow. It listens on `POST /webhook/shopee-affiliate`.

Call it:

```bash
curl -X POST http://<n8n-host>/webhook/shopee-affiliate \
  -H "Content-Type: application/json" \
  -d '{
    "pid": "23552060269",
    "links": ["https://shopee.vn/product/xxx/23552060269"],
    "subIds": {"sub_id1": "campaign_a"}
  }'
```

Response is the merged result of `Get Custom Link` + `Get Commission`. Cookies only need to be included the first time (`"cookies": [...]`) or after the session expires — the workflow's **Has Cookies?** branch skips `/login` when omitted and reuses the persisted session.

**Docker note:** if n8n runs in a container and the Playwright service runs on the host, `localhost` inside the container won't reach it — use `http://host.docker.internal:4000` (Docker Desktop) or run both in the same docker-compose network and reference the service by container name.

## Deploying on Linux

Node + Playwright run fine on Linux, but a server has no physical display, so `HEADLESS=false` (the setting that let this pass without a captcha) can't open a real window like it did on your Windows desktop. Two options:

**Option A — Docker (recommended).** The included [Dockerfile](playwright-service/Dockerfile) is based on the official Playwright image, installs `xvfb`, and starts the service under `xvfb-run` so Chromium still runs "headed" against a virtual display instead of falling back to the headless flag.
```bash
cd shopee-affiliate-automation/playwright-service
docker build -t shopee-affiliate-service .
docker run -d --name shopee-affiliate -p 4000:4000 \
  -e SERVICE_API_KEY=<your key> \
  -v $(pwd)/storage:/app/storage \
  shopee-affiliate-service
```
(`-v .../storage` persists the logged-in session and your `session-cookie.txt` across container restarts.)

**Option B — bare metal (systemd/pm2).**
```bash
sudo apt-get update && sudo apt-get install -y xvfb
cd shopee-affiliate-automation/playwright-service
npm install
npx playwright install --with-deps chromium   # --with-deps pulls the Linux system libs Chromium needs
cp .env.example .env   # edit SERVICE_API_KEY
npm run start:xvfb     # wraps `node server.js` in xvfb-run
```
Wrap `npm run start:xvfb` in a systemd unit (`ExecStart=/usr/bin/npm run start:xvfb`, `WorkingDirectory=.../playwright-service`) or `pm2 start npm --name shopee-affiliate -- run start:xvfb` so it survives reboots/crashes.

Either way, `HEADLESS` stays `false` — Xvfb only supplies the missing display, it doesn't change what Chromium reports about itself.

**Caveats specific to a server:**
- A datacenter/cloud IP is itself a bot signal to some WAFs, independent of headless vs. headed — Xvfb fixes the browser-fingerprint half of the problem, not the IP-reputation half. If you still get redirected to `verify/captcha` after switching to Xvfb, that's the likely remaining cause.
- If n8n runs in a separate container from this service, `localhost` won't resolve between them — put both in the same docker-compose network and reference the service by container name, or use `http://host.docker.internal:4000` (needs `--add-host=host.docker.internal:host-gateway` on Linux Docker, unlike Docker Desktop where it works by default).

## CI/CD: docker-compose + GitHub Actions

[`docker-compose.yml`](docker-compose.yml) (repo root) builds [`playwright-service/Dockerfile`](playwright-service/Dockerfile) as its own standalone stack — separate repo, separate compose project, own default Docker network. It does **not** join the `quanlytro` project's `tro247_network`: this service has no dependency on that Postgres/API stack, so keeping it fully separate means deploying it can never affect the live quanlytro containers. Port `4000` is published to the VPS host, so anything on that VPS (n8n included, whether containerized or not) reaches it via `http://<vps-ip>:4000` or `http://host.docker.internal:4000` from inside another container.

**One-time setup on the VPS:**
```bash
git clone <this-repo-url> /opt/shopee-affiliate
cd /opt/shopee-affiliate
cp .env.example .env                # edit SERVICE_API_KEY
docker compose up -d --build        # first deploy, manual
```
`playwright-service/storage/` is bind-mounted so the logged-in session (`storageState.json`) survives redeploys — after the first deploy, seed it once with the cookie file + `docker compose exec shopee-affiliate npm run seed-login` (or `POST /login` over the network), same as local.

**GitHub Actions** ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs on every push to `main`: SSHes into the VPS and does `git pull` + `docker compose up -d --build`. It does **not** copy files over — the VPS pulls from git itself, so `.env` (gitignored) is never touched by deploys.

Add these as **GitHub repo secrets** (Settings → Secrets and variables → Actions):
| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP/hostname |
| `VPS_PORT` | SSH port |
| `VPS_USER` | SSH user (e.g. `root`) |
| `VPS_SSH_KEY` | Private key whose **public** half is in the VPS's `~/.ssh/authorized_keys` — use a dedicated deploy key, not your personal one |
| `VPS_DEPLOY_PATH` | Absolute path to the clone on the VPS, e.g. `/opt/shopee-affiliate` |

If the GitHub repo is private, the VPS also needs its own read-only **deploy key** registered on the repo (GitHub → repo → Settings → Deploy keys) so `git pull` works there — separate from the `VPS_SSH_KEY` above, which is for GitHub Actions to reach the VPS, not the other way around.

## Selectors that may need adjusting

`affiliate.shopee.vn` is a dynamic React app with non-stable class names, so `customLink.js` and `commission.js` locate elements by **visible text** (button label, "Sub_idN" labels) and by **intercepting the page's own API calls** rather than by CSS class — this is deliberately the most change-resistant approach, but Shopee can still alter labels/structure over time.

If a call starts returning empty results, re-inspect the live page with your own logged-in session:

```bash
npx playwright codegen https://affiliate.shopee.vn/offer/custom_link
```

and adjust the locator in `lib/customLink.js` / `lib/commission.js` accordingly.

## Notes

- This automates *your own* affiliate account using *your own* session cookies — no credentials are typed into any form and none are stored in n8n; only the `SERVICE_API_KEY` (a secret you invent for talking to your own local service) lives in the workflow.
- Keep `playwright-service/storage/storageState.json` and `.env` out of version control (already covered by `.gitignore`) — it contains your live session.
