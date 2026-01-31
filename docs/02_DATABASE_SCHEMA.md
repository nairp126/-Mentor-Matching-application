# 02. Database Schema & Data Models

## 1. Overview

The Mentor Matching Platform uses a **PostgreSQL** relational database for primary data storage. The schema uses **UUIDs** for all primary keys and enforces data integrity via Foreign Key relationships and constraints.

**Key Features:**

- **UUIDs**: Used everywhere for ID obfuscation and collision avoidance.
- **RBAC**: Enforced via `user_role` enums.
- **Polymorphism**: Separation of `mentor_profiles` and `student_profiles`.
- **JSONB**: Used for flexible preferences/metadata (e.g., `expertise_areas`, `metadata`).

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--|| MENTOR_PROFILES : "has"
    USERS ||--|| STUDENT_PROFILES : "has"
    USERS ||--o{ SESSIONS : "mentor_creates"
    USERS ||--o{ SESSION_REGISTRATIONS : "student_registers"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ CONVERSATION_PARTICIPANTS : "joins"
    USERS ||--o{ MESSAGES : "sends"
    USERS ||--o{ MATCHING_PREFERENCES : "has"

    SESSIONS ||--o{ SESSION_REGISTRATIONS : "has"
    SESSIONS ||--o{ SESSION_MATERIALS : "contains"
    SESSIONS ||--o{ WAITLIST_ENTRIES : "has_waitlist"
    SESSIONS ||--o{ REVIEWS : "receives"

    CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : "has_members"
    CONVERSATIONS ||--o{ MESSAGES : "contains"
    CONVERSATIONS ||--o{ VIDEO_CALL_SESSIONS : "hosts"

    %% Table Definitions
    USERS {
        uuid id PK
        string email
        enum role
        string password_hash
        boolean mfa_enabled
    }

    MENTOR_PROFILES {
        uuid user_id FK
        text bio
        text[] expertise_areas
        decimal hourly_rate
        decimal rating
    }

    STUDENT_PROFILES {
        uuid user_id FK
        text bio
        text[] learning_goals
        enum current_level
    }

    SESSIONS {
        uuid id PK
        uuid mentor_id FK
        string title
        enum session_type
        enum status
        int capacity
    }
    
    SESSION_REGISTRATIONS {
        uuid session_id FK
        uuid student_id FK
        enum status
    }

    CONVERSATIONS {
        uuid id PK
        enum type
        jsonb metadata
    }

    MATCHING_PREFERENCES {
        uuid user_id FK
        jsonb preferred_expertise
        jsonb preferred_slots
    }
```

## 3. Core Tables Breakdown

### User Management

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `users` | Core identity table. Contains AuthN data and Role. | Parent of all user data. |
| `mentor_profiles` | Additional data for Mentors (Bio, Rate, Experience). | One-to-One with `users`. |
| `student_profiles` | Additional data for Students (Goals, Level). | One-to-One with `users`. |
| `availability_slots` | Time slots when a mentor is available. | Many-to-One with `users`(Mentor). |

### Session Management

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `sessions` | The core "product". Represents a scheduled mentorship event. | Owned by `users`(Mentor). |
| `session_registrations` | Junction table tracking who booked which session. | Link between `sessions` and `users`. |
| `waitlist_entries` | Overflow queue for full sessions. | Link between `sessions` and `users`. |
| `session_materials` | Resources (PDF/Link) attached to a session. | Many-to-One with `sessions`. |

### Communication

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `conversations` | A chat room (Direct or Group). | Parent of participants/messages. |
| `messages` | Individual chat messages. | Many-to-One with `conversations` & `users`. |
| `video_call_sessions` | Metadata for live video calls (Room IDs, Duration). | Linked to `conversations`. |

### Matching & Intelligence

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `matching_preferences` | User settings for the matching algorithm. | One-to-One with `users`. |
| `matching_feedback` | Post-match feedback to improve the algorithm. | Linked to `sessions` and `users`. |
| `reviews` | Public ratings and text reviews for sessions. | Linked to `sessions` and `users`. |

### Infrastructure

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `notifications` | System alerts/emails sent to users. | Linked to `users`. |
| `audit_logs` | Security and action tracking log. | Linked to `users` (optional). |

## 4. Design Patterns & Constraints

- **Cascade Deletes**: Most Foreign Keys use `ON DELETE CASCADE`. If a User is deleted, their Profile, Messages, and Registrations vanish.
- **Enums**: Heavily used for status/types (`session_status`, `user_role`) ensures strict data validation at the DB level.
- **JSONB**: Used for `metadata` and complex preferences to allow schema flexibility without migrations.
- **Timestamps**: All tables track `created_at` and `updated_at`, managed by DB triggers.
