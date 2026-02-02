# implementation Roadmap & Gap Analysis

## ⚠️ Current Development Status

**Overall Status**: 🚧 **Beta / Work-in-Progress** 🚧

The project follows a robust microservices architecture (Monorepo) with a comprehensive implementation of core services (Auth, User, Session). However, several critical security checks, features, and integrations are mocked or marked as "TODO", particularly in complex flows like session ownership verification and privacy enforcement.

### Service-by-Service Audit

| Service | Status | Key Findings |
| :--- | :--- | :--- |
| **Auth Service** | 🟢 **Stable** | Complete auth flow, MFA, Redis session management. Demo files present (`demo-*.ts`) should be removed in prod. |
| **User Service** | 🟡 **Partial** | Profile management works, but **Privacy Settings** enforcement is explicitly marked as `TODO`. |
| **Session Service** | 🟡 **Partial** | Core logic exists, but critical **Security Checks** (e.g., verifying mentor ownership) are marked as `TODO`. |
| **Notification Service** | 🟡 **Partial** | Email infra exists, but **Push Notifications** are marked as `TODO`. |
| **Matching Service** | ⚪ **Unknown** | Structure exists, but algorithms likely need tuning for scale. |
| **Communication Service** | ⚪ **Unknown** | Basic structure present. |
| **Web App** | � **Partial** | Extensive page structure (25+ pages), but **Core Views** (Mentors, Sessions) are UI shells only. |
| **API Gateway** | 🟢 **Stable** | Correctly routing to microservices. |

---

## 🛑 The "Missing" List (Gap Analysis)

The following features are logically required but are currently incomplete or mocked:

### 4. Frontend UI Gaps (New)

* **Mentors Page**: `MentorsPage.tsx` is a placeholder ("Mentor discovery... will be implemented here").
* **Sessions Page**: `SessionsPage.tsx` is a placeholder ("Session browsing... will be implemented here").
* **Detail Views**: `MentorDetailPage.tsx` and `SessionDetailPage.tsx` likely lack real data binding.

### 1. Security & Privacy Enforcements (Critical)

* **User Privacy**: `packages/user-service/src/routes/profile.ts` explicitly skips privacy checks (`// TODO: Apply privacy settings here`).
* **Session Ownership**: `packages/session-service/src/routes/registrations.ts` skips verifying if the requester actually owns the session (`// TODO: Verify that the mentor owns this session`).
* **Rate Limiting**: Specific auth endpoints have stricter limits, but general service-to-service communication might lack internal throttling.

### 2. Feature Gaps

* **Notifications**: Push notification logic is stubbed (`// TODO: Implement push notifications` in `notification-service`).
* **Registration Logic**: Post-promotion notifications are missing (`// TODO: Send notification to promoted student` in `session-service`).

### 3. Production Readiness

* **Cleanup**: `auth-service` contains `demo-*.ts` files which should be excluded from the build.
* **Testing**: While `__tests__` directories exist, coverage for the "TODO" edge cases is naturally missing.

---

## 🗺️ Step-by-Step Implementation Guide

Follow this guide to move from Beta to Production.

### Phase 1: Security Hardening (Priority: High)

#### 1. Implement Privacy Checks in User Service

* **File**: `packages/user-service/src/routes/profile.ts`

- **Task**: Replace the `TODO` with actual logic.
* **Action**:
    1. Fetch the target user's `privacySettings` from the DB.
    2. Check if `req.user.id` matches the target or if the field is public.
    3. Filter the response object accordingly before sending it back.

#### 2. Enforce Session Ownership

* **File**: `packages/session-service/src/routes/registrations.ts`

- **Task**: Prevent unauthorized modifications to sessions.
* **Action**:
    1. In the `PUT/DELETE` handlers, fetch the session first: `const session = await db.query(...)`.
    2. Verify: `if (session.mentorId !== req.user.id) throw new ForbiddenError()`.

### Phase 2: Feature Completion (Priority: Medium)

#### 3. Enable Push Notifications

* **File**: `packages/notification-service/src/services/notificationService.ts`

- **Task**: Integrate a provider (e.g., Firebase FCM or OneSignal).
* **Action**:
    1. Install SDK: `npm install firebase-admin`.
    2. Implement `sendPush` method to consume the pending `TODO`.
    3. Update user model to store `fcmToken`.

#### 4. Complete Registration Workflows

* **File**: `packages/session-service/src/services/registrationService.ts`

- **Task**: Clear the `TODO` regarding "Send notification to promoted student".
* **Action**:
    1. Call the `NotificationService` (via internal HTTP or Event Bus) when `promoteStudent` is successful.
    2. Trigger the `STUDENT_PROMOTED` email template.

### Phase 3: Cleanup & Optimization

* **Action**: Delete `packages/auth-service/src/demo-*.ts`.

- **Action**: Run a full audit of `package.json` dependencies to remove unused dev-dependencies from production builds.
