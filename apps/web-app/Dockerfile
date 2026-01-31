# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/web-app/package*.json ./apps/web-app/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build the application
FROM base AS builder
WORKDIR /app

# Copy source code
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build web application
RUN cd apps/web-app && npm run build

# Production image - use nginx for serving static files
FROM nginx:alpine AS runner

# Copy built application
COPY --from=builder /app/apps/web-app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web-app/nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup --system --gid 1001 webapp
RUN adduser --system --uid 1001 webapp

# Set ownership
RUN chown -R webapp:webapp /usr/share/nginx/html
RUN chown -R webapp:webapp /var/cache/nginx
RUN chown -R webapp:webapp /var/log/nginx
RUN chown -R webapp:webapp /etc/nginx/conf.d
RUN touch /var/run/nginx.pid
RUN chown -R webapp:webapp /var/run/nginx.pid

USER webapp

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]