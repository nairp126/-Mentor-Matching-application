# User Service

## 1. Purpose & Responsibility

**What this module does**:
Handles the management of User Profiles for both Mentors and Students. It extends the basic identity data (from Auth Service) with rich domain-specific information like Biographies, Expertise, Learning Goals, and Availability.

**Why it exists**:
To separate "Identity" (Auth) from "Profile" (Domain). This allows the profile structure to evolve (e.g., adding LinkedIn URLs, detailed skills) without impacting the core authentication logic.

## 2. Core Components & Structure

- **`index.ts`**: Service entry point.
- **`routes/`**:
  - `profile.ts`: CRUD operations for user profiles.
  - `image.ts`: Handling profile picture uploads.
  - `privacy.ts`: Managing visibility settings (public/private profile).
- **`services/`**:
  - `profileService.ts`: Business logic for aggregating user data from DB.

## 3. Implementation Details

- **Polymorphism**: Handles two distinct profile types (`mentor_profiles` vs `student_profiles`) based on the User's Role.
- **Data Optimization**: Uses `DatabaseOptimization.initializePool` from Shared for efficient connection management.
- **File Handling**: Connects to abstract storage (Local/S3) for profile images.

## 4. Inter-Module Communication

- **Inputs**: User ID (from Token), Profile Updates (JSON).
- **Outputs**: Public Profile Data (sanitized based on privacy settings).
- **Dependencies**:
  - `packages/shared`: Database utilities.
  - `PostgreSQL`: Stores profile data.

## 5. Usage Example

**Fetching a Profile**:

```typescript
// GET /api/profiles/:userId
const profile = await profileService.getProfile(userId);
// Returns { id: "...", role: "MENTOR", bio: "...", skills: [...] }
```
