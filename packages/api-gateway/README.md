# API Gateway

## 1. Purpose & Responsibility

**What this module does**:
The API Gateway serves as the single entry point for all client requests to the Mentor Matching Platform. It acts as a Backend-for-Frontend (BFF) layer that aggregates microservices, handles cross-cutting concerns, and manages traffic routing.

**Why it exists**:
To decouple the client from the internal microservices architecture, enforcing security boundaries, rate limiting, and centralized authentication verification before requests reach the internal network.

## 2. Core Components & Structure

- **`index.ts`**: The main application entry point. Configures Express, CORS, Helmet, and mounts all proxy routes.
- **`middleware/`**:
  - `apiKey.ts`: Handles validation for `x-api-key` headers (mainly for Webhooks).
  - `monitoring.ts`: Prometheus/Grafana metric collectors.
  - `versioning.ts`: Manages API versioning strategies.
- **`routes/`**:
  - `webhooks.ts`: Specialized routes for external integrations (e.g., Stripe, SendGrid).
- **`services/`**:
  - `webhookService.ts`: Logic for processing incoming webhooks.

## 3. Implementation Details

- **Proxy Pattern**: Uses `http-proxy-middleware` to forward requests to internal services (Auth, User, Session, etc.).
- **Security**: Integrates `@mentor-platform/shared` for `SecurityMiddleware` (Helmet, Rate Limiting, Input Sanitization).
- **Authentication**: Validates JWTs at the gateway level using `AuthUtils.createAuthMiddleware()` before proxying, injecting `X-User-ID` and `X-User-Role` headers downstream.

## 4. Inter-Module Communication

- **Inputs**: HTTP Requests from Clients (Web App, Mobile).
- **Outputs**: Proxied HTTP requests to internal microservices.
- **Dependencies**:
  - `packages/shared`: For Types, Auth Verification, and Security Middleware.
  - Internal Microservices (Auth, User, Session, Match, Comm, Notify, Admin).

## 5. Usage Example

**Running the Gateway**:

```bash
# From root
npm run dev --filter=api-gateway
```

**Route Configuration (in `index.ts`)**:

```typescript
// Example of Proxy Setup
app.use('/api/users', authMiddleware, createProxyMiddleware({
  target: process.env.USER_SERVICE_URL, // e.g., http://localhost:3002
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    // Inject User Context
    proxyReq.setHeader('X-User-ID', req.user.userId);
  }
}));
```
