# Matching Service

## 1. Purpose & Responsibility

**What this module does**:
The "Intelligence" of the platform. It provides Search capabilities (finding mentors by skill) and Recommendations (suggesting mentors to students based on learning goals).

**Why it exists**:
To allow for complex queries (Fuzzy search, Relevance scoring) that are inefficient in a standard relational database.

## 2. Core Components & Structure

- **`index.ts`**: Service entry point.
- **`routes/`**:
  - `search.ts`: Full-text search endpoints.
  - `recommendations.ts`: Personalized feed logic.
  - `preferences.ts`: User settings for the matching algorithm.
- **`services/`**:
  - Likely integrates with an `Elasticsearch` client (implied by infrastructure).

## 3. Implementation Details

- **Elasticsearch**: Used as the primary read-model for high-performance search.
- **Algorithm**: Matches `Student.learning_goals` overlapping with `Mentor.expertise_areas`.
- **Syncing**: Listens to domain events (User Created/Updated) to keep the Search Index up-to-date.

## 4. Inter-Module Communication

- **Inputs**: Search Queries ("React", "Leadership"), User Prferences.
- **Outputs**: Ranked list of Mentors/Sessions.
- **Dependencies**:
  - `Elasticsearch`: The search engine.
  - `Redis`: Caching frequent search results.

## 5. Usage Example

**Search Request**:

```http
GET /api/search/mentors?q=python&level=intermediate
```

**Response**:

```json
{
  "hits": [
    { "mentorId": "...", "score": 0.95, "name": "Alice" },
    { "mentorId": "...", "score": 0.82, "name": "Bob" }
  ]
}
```
