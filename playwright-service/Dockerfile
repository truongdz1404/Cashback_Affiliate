FROM mcr.microsoft.com/playwright:v1.47.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY . .

ENV PORT=4000
ENV HEADLESS=false
EXPOSE 4000

# Xvfb gives Chromium a virtual display so HEADLESS=false works with no
# physical screen - this runs a real "headed" browser, not the headless flag
# that Shopee Shield's WAF fingerprints (see README > Deploying on Linux).
# scripts/start-xvfb.sh starts Xvfb directly rather than via the `xvfb-run`
# wrapper, which hangs forever waiting on a readiness signal that never
# arrives when running as PID 1 in a container.
CMD ["bash", "scripts/start-xvfb.sh"]
