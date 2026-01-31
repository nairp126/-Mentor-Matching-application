# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/notification-service/package*.json ./packages/notification-service/
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

# Build notification service
RUN cd packages/notification-service && npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 notifyservice

# Copy built application
COPY --from=builder --chown=notifyservice:nodejs /app/packages/notification-service/dist ./dist
COPY --from=builder --chown=notifyservice:nodejs /app/packages/shared/dist ./shared
COPY --from=deps --chown=notifyservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=notifyservice:nodejs /app/packages/notification-service/package*.json ./

USER notifyservice

EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]