FROM mcr.microsoft.com/playwright:v1.47.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=4000
ENV HEADLESS=false
EXPOSE 4000

# xvfb-run gives Chromium a virtual display so HEADLESS=false works with no
# physical screen - this runs a real "headed" browser, not the headless flag
# that Shopee Shield's WAF fingerprints (see README > Deploying on Linux).
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1920x1080x24", "node", "server.js"]
