# Session Service

## 1. Purpose & Responsibility

**What this module does**:
The core engine for the mentorship marketplace. It manages the lifecycle of Mentorship Sessions: Creation, Scheduling, Booking (Registration), Waitlisting, and Cancellation.

**Why it exists**:
To encapsulate the complex logic of time-slot management and concurrency (preventing double booking).

## 2. Core Components & Structure

- **`index.ts`**: Entry point. Starts the HTTP server and the **Scheduler**.
- **`routes/`**:
  - `sessions.ts`: CRUD for Session objects.
  - `registrations.ts`: Logic for Students joining sessions.
  - `recurring.ts`: Management of recurring series (e.g., "Weekly Sync").
- **`services/schedulerService.ts`**: A background job runner that handles recurring session generation and reminder triggers.

## 3. Implementation Details

- **Concurrency Control**: Must handle race conditions where two students try to book the last spot simultaneously.
- **State Machine**: Tracks session status (`OPEN`, `FULL`, `COMPLETED`, `CANCELLED`).
- **Waitlist Pattern**: Implements a FIFO queue for fully booked sessions.

## 4. Inter-Module Communication

- **Inputs**: Booking Requests, Session Details.
- **Outputs**: Confirmed Registrations.
- **Dependencies**:
  - `PostgreSQL`: Stores Sessions/Registrations.
  - `Redis`: Distributed locks for booking consistency.
  - `NotificationService`: Triggers emails upon booking confirmation (async via events).

## 5. Usage Example

**Creating a Session (Mentor)**:

```typescript
// POST /api/sessions
{
  "title": "React Architecture Deep Dive",
  "startTime": "2024-02-10T10:00:00Z",
  "duration": 60,
  "capacity": 5
}
```
