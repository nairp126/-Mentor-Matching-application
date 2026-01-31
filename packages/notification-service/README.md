# Notification Service

## 1. Purpose & Responsibility

**What this module does**:
The central dispatcher for all system alerts. It handles Email, SMS, and In-App notifications. It also manages user notification preferences (e.g., "Email me only for Session Reminders").

**Why it exists**:
To prevent other services from needing to know *how* to send an email or who the provider is (Waitlist Service -> "Notify User" -> Notification Service -> SendGrid).

## 2. Core Components & Structure

- **`index.ts`**: Entry point.
- **`services/`**:
  - `notificationService.ts`: Core logic to route messages to the right channel.
  - `schedulerService.ts`: Checks for pending scheduled notifications.
  - `sessionReminderService.ts`: Specific logic for "15 mins before session" alerts.
  - `failureHandlingService.ts`: Retry logic for failed sends.

## 3. Implementation Details

- **Async Processing**: Uses mechanisms to queue and retry failed notifications.
- **Preference Aware**: Checks `user_preferences` before sending. If a user opted out of Email, it skips that channel.
- **Templates**: Likely uses stored templates for standard emails (Welcome, Reset Password).

## 4. Inter-Module Communication

- **Inputs**: Internal HTTP requests from other services (`POST /api/notifications/send`).
- **Outputs**: External API calls (SendGrid/Twilio) and In-App updates via DB.
- **Dependencies**:
  - `Redis`: For queuing/locking jobs.
  - External Providers (Mocked or Real APIs).

## 5. Usage Example

**Triggering a Notification (Internal)**:

```typescript
// Called by Auth Service after Registration
await fetch('http://notification-service:3006/api/notifications/send', {
  method: 'POST',
  body: JSON.stringify({
    userId: '123',
    type: 'WELCOME_EMAIL',
    payload: { name: 'John Doe' }
  })
});
```
