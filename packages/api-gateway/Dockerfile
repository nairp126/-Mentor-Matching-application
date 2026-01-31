FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/api-gateway/package*.json ./packages/api-gateway/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production

# Copy shared package
COPY packages/shared ./packages/shared

# Build shared package
RUN cd packages/shared && npm run build

# Copy gateway source
COPY packages/api-gateway ./packages/api-gateway

# Build gateway
RUN cd packages/api-gateway && npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "packages/api-gateway/dist/index.js"]