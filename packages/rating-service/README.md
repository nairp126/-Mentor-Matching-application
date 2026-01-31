# Rating & Review Service

## 1. Purpose & Responsibility

**What this module does**:
Collects and analyzes feedback from mentorship sessions. It calculates Mentor Ratings (Stars), stores written reviews, and provides moderation tools.

**Why it exists**:
To ensure trust and quality in the marketplace by aggregating reputation data.

## 2. Core Components & Structure

- **`index.ts`**: Entry point with `node-cron` schedulers.
- **`routes/`**:
  - `ratings.ts`: CRUD for reviews.
  - `moderation.ts`: Endpoints for admins to flag/remove content.
  - `analytics.ts`: Aggregated stats (Avg Rating, Session Count).
- **`services/`**:
  - `ratingService.ts`: Business logic for scoring.
  - `reviewValidationService.ts`: Automated profanity/spam checks.

## 3. Implementation Details

- **Scheduled Tasks**:
  - `processScheduledRatingPrompts`: Runs every 15m to prompt users after a session ends.
  - `expireOldRatingPrompts`: Runs daily to clean up stale data.
- **Analytics**: Calculates aggregate scores (e.g., 4.5/5.0) which are consumed by the Matching Service for ranking.

## 4. Inter-Module Communication

- **Inputs**: User Reviews, Cron Triggers.
- **Outputs**: Updated Mentor Scores.
- **Dependencies**:
  - `node-cron`: For task scheduling.
  - `PostgreSQL`: Stores standard relational data.

## 5. Usage Example

**Submitting a Review**:

```json
POST /api/ratings
{
  "sessionId": "...",
  "rating": 5,
  "comment": "Excellent session, very helpful!"
}
```
