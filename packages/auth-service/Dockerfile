# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/auth-service ./packages/auth-service

# Install all dependencies
RUN npm install

# Build shared package first
RUN cd packages/shared && npm run build

# Build auth service
RUN cd packages/auth-service && npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 authservice

# Copy built application and dependencies
COPY --from=builder --chown=authservice:nodejs /app/packages/auth-service/dist ./dist
COPY --from=builder --chown=authservice:nodejs /app/packages/shared/dist ./shared
COPY --from=builder --chown=authservice:nodejs /app/packages/auth-service/node_modules ./node_modules
COPY --from=builder --chown=authservice:nodejs /app/packages/auth-service/package*.json ./

USER authservice

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]