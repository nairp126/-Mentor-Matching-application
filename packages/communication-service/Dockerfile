# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/communication-service/package*.json ./packages/communication-service/
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

# Build communication service
RUN cd packages/communication-service && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 commservice

# Copy built application
COPY --from=builder --chown=commservice:nodejs /app/packages/communication-service/dist ./dist
COPY --from=builder --chown=commservice:nodejs /app/packages/shared/dist ./shared
COPY --from=deps --chown=commservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=commservice:nodejs /app/packages/communication-service/package*.json ./

USER commservice

EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]