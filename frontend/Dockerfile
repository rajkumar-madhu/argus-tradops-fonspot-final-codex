FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is inlined at build time. It is intentionally NOT set here: the
# API base is injected per request by app/layout.tsx from the runtime `API_URL`
# env, so one image serves every environment. Set NEXT_PUBLIC_API_URL only if you
# want a baked-in fallback for a static/offline deployment.
RUN npm test && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Numeric uid so `runAsNonRoot: true` can verify the image user.
RUN addgroup -S -g 10001 tradeops && adduser -S -u 10001 -G tradeops tradeops
COPY --from=build --chown=10001:10001 /app/.next ./.next
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
USER 10001:10001
EXPOSE 3000
# Run next directly rather than via `npm start`: npm adds an `sh -c` layer as
# PID 1 that does not reliably forward SIGTERM, so pods sat out the full grace
# period and were SIGKILLed mid-request. `next start` drains and exits on SIGTERM.
CMD ["node","node_modules/next/dist/bin/next","start"]
