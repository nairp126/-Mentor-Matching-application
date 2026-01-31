# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/session-service/package*.json ./packages/session-service/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build the application
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build shared package first
RUN cd packages/shared && npm run build

# Build session service
RUN cd packages/session-service && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sessionservice

# Copy built application
COPY --from=builder --chown=sessionservice:nodejs /app/packages/session-service/dist ./dist
COPY --from=builder --chown=sessionservice:nodejs /app/packages/shared/dist ./shared
COPY --from=deps --chown=sessionservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sessionservice:nodejs /app/packages/session-service/package*.json ./

USER sessionservice

EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]