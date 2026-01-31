import { DatabaseManager } from '@mentor-platform/shared';

export interface SessionRecommendation {
  session: SessionInfo;
  compatibilityScore: number;
  reasons: string[];
  mentor: MentorInfo;
}

export interface SessionInfo {
  id: string;
  mentorId: string;
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  scheduledAt: Date;
  duration: number;
  capacity: number;
  currentRegistrations: number;
  status: string;
}

export interface MentorInfo {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  expertiseAreas: string[];
  rating: number;
  totalSessions: number;
  yearsOfExperience: number;
}

export interface StudentProfile {
  id: string;
  learningGoals: string[];
  interests: string[];
  currentLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  preferredSessionTypes: string[];
}

export interface MatchingPreferences {
  userId: string;
  preferredExpertiseAreas: string[];
  preferredSessionTypes: string[];
  preferredTimeSlots: TimeSlot[];
  maxTravelTime?: number;
  minMentorRating?: number;
  preferredMentorExperience?: 'ANY' | 'JUNIOR' | 'SENIOR' | 'EXPERT';
  sessionFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'FLEXIBLE';
  learningStyle?: 'VISUAL' | 'AUDITORY' | 'KINESTHETIC' | 'MIXED';
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  dayOfWeek: number; // 0-6, Sunday = 0
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string;
}

export interface MatchingFeedback {
  sessionId: string;
  studentId: string;
  rating: number; // 1-5
  attended: boolean;
  helpful: boolean;
  matchQuality: number; // 1-5, how well the session matched expectations
  feedback?: string;
  createdAt: Date;
}

export class MatchingService {
  private db: DatabaseManager;

  constructor() {
    // Initialize database connection
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mentor_platform',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    };

    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    };

    this.db = new DatabaseManager(dbConfig, redisConfig);
  }

  async getRecommendations(studentId: string, limit: number = 10): Promise<SessionRecommendation[]> {
    const client = await this.db.getClient();
    
    try {
      // Get student profile and preferences
      const studentProfile = await this.getStudentProfile(client, studentId);
      const preferences = await this.getMatchingPreferencesInternal(client, studentId);
      const sessionHistory = await this.getStudentSessionHistory(client, studentId);

      // Get available sessions
      const availableSessions = await this.getAvailableSessions(client);

      // Calculate compatibility scores for each session
      const recommendations: SessionRecommendation[] = [];

      for (const session of availableSessions) {
        const mentor = await this.getMentorInfo(client, session.mentorId);
        const compatibilityScore = this.calculateCompatibilityScore(
          studentProfile,
          preferences,
          sessionHistory,
          session,
          mentor
        );

        if (compatibilityScore.score > 0.3) { // Only include sessions with reasonable compatibility
          const reasons = this.generateRecommendationReasons(compatibilityScore);
          
          recommendations.push({
            session,
            compatibilityScore: compatibilityScore.score,
            reasons,
            mentor
          });
        }
      }

      // Sort by compatibility score and return top results
      recommendations.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
      return recommendations.slice(0, limit);
    } finally {
      client.release();
    }
  }

  async getMatchingPreferences(userId: string): Promise<MatchingPreferences | null> {
    const client = await this.db.getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM matching_preferences WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapPreferencesFromDb(result.rows[0]);
    } finally {
      client.release();
    }
  }

  private async getStudentProfile(client: any, studentId: string): Promise<StudentProfile> {
    const result = await client.query(`
      SELECT sp.*, u.id
      FROM student_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE u.id = $1
    `, [studentId]);

    if (result.rows.length === 0) {
      throw new Error('Student profile not found');
    }

    const profile = result.rows[0];
    return {
      id: profile.id,
      learningGoals: JSON.parse(profile.learning_goals || '[]'),
      interests: JSON.parse(profile.interests || '[]'),
      currentLevel: profile.current_level || 'BEGINNER',
      preferredSessionTypes: JSON.parse(profile.preferred_session_types || '[]')
    };
  }

  private async getMatchingPreferencesInternal(client: any, userId: string): Promise<MatchingPreferences | null> {
    const result = await client.query(`
      SELECT * FROM matching_preferences WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const pref = result.rows[0];
    return {
      userId: pref.user_id,
      preferredExpertiseAreas: JSON.parse(pref.preferred_expertise_areas || '[]'),
      preferredSessionTypes: JSON.parse(pref.preferred_session_types || '[]'),
      preferredTimeSlots: JSON.parse(pref.preferred_time_slots || '[]'),
      maxTravelTime: pref.max_travel_time,
      minMentorRating: pref.min_mentor_rating,
      preferredMentorExperience: pref.preferred_mentor_experience,
      sessionFrequency: pref.session_frequency,
      learningStyle: pref.learning_style,
      createdAt: pref.created_at,
      updatedAt: pref.updated_at
    };
  }

  private async getStudentSessionHistory(client: any, studentId: string): Promise<any[]> {
    const result = await client.query(`
      SELECT s.*, sr.status, sr.registered_at, mf.rating, mf.helpful, mf.match_quality
      FROM sessions s
      JOIN session_registrations sr ON s.id = sr.session_id
      LEFT JOIN matching_feedback mf ON s.id = mf.session_id AND mf.student_id = $1
      WHERE sr.student_id = $1 AND sr.status IN ('ATTENDED', 'COMPLETED')
      ORDER BY s.scheduled_at DESC
      LIMIT 20
    `, [studentId]);

    return result.rows;
  }

  private async getAvailableSessions(client: any): Promise<SessionInfo[]> {
    const result = await client.query(`
      SELECT * FROM sessions 
      WHERE status = 'SCHEDULED' 
        AND scheduled_at > NOW()
        AND current_registrations < capacity
      ORDER BY scheduled_at ASC
      LIMIT 100
    `);

    return result.rows.map((row: any) => ({
      id: row.id,
      mentorId: row.mentor_id,
      title: row.title,
      description: row.description,
      expertiseAreas: JSON.parse(row.expertise_areas || '[]'),
      sessionType: row.session_type,
      scheduledAt: row.scheduled_at,
      duration: row.duration,
      capacity: row.capacity,
      currentRegistrations: row.current_registrations,
      status: row.status
    }));
  }

  private async getMentorInfo(client: any, mentorId: string): Promise<MentorInfo> {
    const result = await client.query(`
      SELECT mp.*, u.id
      FROM mentor_profiles mp
      JOIN users u ON mp.user_id = u.id
      WHERE u.id = $1
    `, [mentorId]);

    if (result.rows.length === 0) {
      throw new Error('Mentor profile not found');
    }

    const mentor = result.rows[0];
    return {
      id: mentor.id,
      firstName: mentor.first_name,
      lastName: mentor.last_name,
      bio: mentor.bio,
      expertiseAreas: JSON.parse(mentor.expertise_areas || '[]'),
      rating: mentor.rating || 0,
      totalSessions: mentor.total_sessions || 0,
      yearsOfExperience: mentor.years_of_experience || 0
    };
  }

  private calculateCompatibilityScore(
    studentProfile: StudentProfile,
    preferences: MatchingPreferences | null,
    sessionHistory: any[],
    session: SessionInfo,
    mentor: MentorInfo
  ): { score: number; breakdown: any } {
    let totalScore = 0;
    let maxScore = 0;
    const breakdown: any = {};

    // 1. Expertise alignment (30% weight)
    const expertiseScore = this.calculateExpertiseAlignment(
      studentProfile.interests,
      preferences?.preferredExpertiseAreas || [],
      session.expertiseAreas,
      mentor.expertiseAreas
    );
    totalScore += expertiseScore * 0.3;
    maxScore += 0.3;
    breakdown.expertise = expertiseScore;

    // 2. Learning goals alignment (25% weight)
    const goalsScore = this.calculateGoalsAlignment(
      studentProfile.learningGoals,
      session.title,
      session.description,
      mentor.expertiseAreas
    );
    totalScore += goalsScore * 0.25;
    maxScore += 0.25;
    breakdown.goals = goalsScore;

    // 3. Session type preference (15% weight)
    const sessionTypeScore = this.calculateSessionTypeScore(
      studentProfile.preferredSessionTypes,
      preferences?.preferredSessionTypes || [],
      session.sessionType
    );
    totalScore += sessionTypeScore * 0.15;
    maxScore += 0.15;
    breakdown.sessionType = sessionTypeScore;

    // 4. Mentor rating and experience (15% weight)
    const mentorScore = this.calculateMentorScore(
      mentor.rating,
      mentor.totalSessions,
      mentor.yearsOfExperience,
      preferences?.minMentorRating,
      preferences?.preferredMentorExperience
    );
    totalScore += mentorScore * 0.15;
    maxScore += 0.15;
    breakdown.mentor = mentorScore;

    // 5. Historical preferences (10% weight)
    const historyScore = this.calculateHistoryScore(sessionHistory, session, mentor);
    totalScore += historyScore * 0.1;
    maxScore += 0.1;
    breakdown.history = historyScore;

    // 6. Time preference (5% weight)
    const timeScore = this.calculateTimeScore(
      preferences?.preferredTimeSlots || [],
      session.scheduledAt
    );
    totalScore += timeScore * 0.05;
    maxScore += 0.05;
    breakdown.time = timeScore;

    return {
      score: maxScore > 0 ? totalScore / maxScore : 0,
      breakdown
    };
  }

  private calculateExpertiseAlignment(
    studentInterests: string[],
    preferredExpertise: string[],
    sessionExpertise: string[],
    mentorExpertise: string[]
  ): number {
    const allStudentInterests = [...studentInterests, ...preferredExpertise];
    const allSessionExpertise = [...sessionExpertise, ...mentorExpertise];
    
    if (allStudentInterests.length === 0 || allSessionExpertise.length === 0) {
      return 0.5; // Neutral score if no data
    }

    let matches = 0;
    for (const interest of allStudentInterests) {
      for (const expertise of allSessionExpertise) {
        if (this.isExpertiseMatch(interest, expertise)) {
          matches++;
          break; // Count each student interest only once
        }
      }
    }

    return Math.min(matches / allStudentInterests.length, 1.0);
  }

  private isExpertiseMatch(interest: string, expertise: string): boolean {
    const interestLower = interest.toLowerCase();
    const expertiseLower = expertise.toLowerCase();
    
    // Exact match
    if (interestLower === expertiseLower) return true;
    
    // Partial match
    if (interestLower.includes(expertiseLower) || expertiseLower.includes(interestLower)) {
      return true;
    }
    
    // Semantic matching (simplified)
    const synonyms: { [key: string]: string[] } = {
      'javascript': ['js', 'node', 'react', 'vue', 'angular'],
      'python': ['django', 'flask', 'data science', 'machine learning'],
      'web development': ['frontend', 'backend', 'full stack', 'html', 'css'],
      'mobile': ['ios', 'android', 'react native', 'flutter'],
      'data': ['analytics', 'science', 'visualization', 'sql', 'database']
    };

    for (const [key, values] of Object.entries(synonyms)) {
      if ((interestLower.includes(key) && values.some(v => expertiseLower.includes(v))) ||
          (expertiseLower.includes(key) && values.some(v => interestLower.includes(v)))) {
        return true;
      }
    }

    return false;
  }

  private calculateGoalsAlignment(
    learningGoals: string[],
    sessionTitle: string,
    sessionDescription: string,
    mentorExpertise: string[]
  ): number {
    if (learningGoals.length === 0) return 0.5;

    const sessionContent = `${sessionTitle} ${sessionDescription} ${mentorExpertise.join(' ')}`.toLowerCase();
    let matches = 0;

    for (const goal of learningGoals) {
      const goalWords = goal.toLowerCase().split(' ');
      const matchingWords = goalWords.filter(word => 
        word.length > 3 && sessionContent.includes(word)
      );
      
      if (matchingWords.length > 0) {
        matches += matchingWords.length / goalWords.length;
      }
    }

    return Math.min(matches / learningGoals.length, 1.0);
  }

  private calculateSessionTypeScore(
    profilePreferences: string[],
    userPreferences: string[],
    sessionType: string
  ): number {
    const allPreferences = [...profilePreferences, ...userPreferences];
    
    if (allPreferences.length === 0) return 0.7; // Neutral-positive if no preference
    
    return allPreferences.includes(sessionType) ? 1.0 : 0.3;
  }

  private calculateMentorScore(
    rating: number,
    totalSessions: number,
    yearsOfExperience: number,
    minRating?: number,
    preferredExperience?: string
  ): number {
    let score = 0;
    let factors = 0;

    // Rating score (0-1)
    if (rating > 0) {
      score += rating / 5.0;
      factors++;
      
      // Penalty if below minimum rating
      if (minRating && rating < minRating) {
        score *= 0.5;
      }
    } else {
      score += 0.5; // Neutral for new mentors
      factors++;
    }

    // Experience score (0-1)
    let experienceScore = 0.5;
    if (preferredExperience) {
      switch (preferredExperience) {
        case 'JUNIOR':
          experienceScore = yearsOfExperience <= 3 ? 1.0 : 0.7;
          break;
        case 'SENIOR':
          experienceScore = yearsOfExperience >= 5 && yearsOfExperience <= 10 ? 1.0 : 0.8;
          break;
        case 'EXPERT':
          experienceScore = yearsOfExperience >= 10 ? 1.0 : 0.6;
          break;
        default:
          experienceScore = 0.8;
      }
    }
    score += experienceScore;
    factors++;

    // Session count bonus (reliability indicator)
    const sessionBonus = Math.min(totalSessions / 50, 0.2); // Up to 0.2 bonus
    score += sessionBonus;

    return factors > 0 ? score / factors : 0.5;
  }

  private calculateHistoryScore(sessionHistory: any[], session: SessionInfo, mentor: MentorInfo): number {
    if (sessionHistory.length === 0) return 0.5;

    let score = 0.5;

    // Check if student has worked with this mentor before
    const mentorHistory = sessionHistory.filter(h => h.mentor_id === mentor.id);
    if (mentorHistory.length > 0) {
      const avgRating = mentorHistory.reduce((sum, h) => sum + (h.rating || 3), 0) / mentorHistory.length;
      score += (avgRating - 3) * 0.2; // Adjust based on past experience
    }

    // Check expertise area preferences from history
    const historicalExpertise = sessionHistory
      .map(h => JSON.parse(h.expertise_areas || '[]'))
      .flat();
    
    const expertiseMatches = session.expertiseAreas.filter(area =>
      historicalExpertise.some(histArea => this.isExpertiseMatch(area, histArea))
    );
    
    if (expertiseMatches.length > 0) {
      score += 0.2;
    }

    // Check session type preferences from history
    const historicalTypes = sessionHistory.map(h => h.session_type);
    const typeFrequency = historicalTypes.filter(type => type === session.sessionType).length;
    
    if (typeFrequency > 0) {
      score += (typeFrequency / historicalTypes.length) * 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  private calculateTimeScore(preferredTimeSlots: TimeSlot[], scheduledAt: Date): number {
    if (preferredTimeSlots.length === 0) return 0.7;

    const sessionDay = scheduledAt.getDay();
    const sessionTime = `${scheduledAt.getHours().toString().padStart(2, '0')}:${scheduledAt.getMinutes().toString().padStart(2, '0')}`;

    for (const slot of preferredTimeSlots) {
      if (slot.dayOfWeek === sessionDay) {
        if (sessionTime >= slot.startTime && sessionTime <= slot.endTime) {
          return 1.0; // Perfect time match
        }
      }
    }

    return 0.3; // No time preference match
  }

  private generateRecommendationReasons(compatibilityScore: any): string[] {
    const reasons: string[] = [];
    const breakdown = compatibilityScore.breakdown;

    if (breakdown.expertise > 0.8) {
      reasons.push('Excellent match for your expertise interests');
    } else if (breakdown.expertise > 0.6) {
      reasons.push('Good alignment with your interests');
    }

    if (breakdown.goals > 0.7) {
      reasons.push('Aligns well with your learning goals');
    }

    if (breakdown.mentor > 0.8) {
      reasons.push('Highly rated and experienced mentor');
    } else if (breakdown.mentor > 0.6) {
      reasons.push('Well-reviewed mentor');
    }

    if (breakdown.sessionType > 0.8) {
      reasons.push('Matches your preferred session format');
    }

    if (breakdown.history > 0.7) {
      reasons.push('Similar to sessions you\'ve enjoyed before');
    }

    if (breakdown.time > 0.8) {
      reasons.push('Scheduled at your preferred time');
    }

    if (reasons.length === 0) {
      reasons.push('Recommended based on your profile');
    }

    return reasons;
  }

  async updatePreferences(userId: string, preferences: Partial<MatchingPreferences>): Promise<MatchingPreferences> {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check if preferences exist
      const existingResult = await client.query(
        'SELECT * FROM matching_preferences WHERE user_id = $1',
        [userId]
      );

      const now = new Date();

      if (existingResult.rows.length === 0) {
        // Create new preferences
        const result = await client.query(`
          INSERT INTO matching_preferences (
            user_id, preferred_expertise_areas, preferred_session_types,
            preferred_time_slots, max_travel_time, min_mentor_rating,
            preferred_mentor_experience, session_frequency, learning_style,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [
          userId,
          JSON.stringify(preferences.preferredExpertiseAreas || []),
          JSON.stringify(preferences.preferredSessionTypes || []),
          JSON.stringify(preferences.preferredTimeSlots || []),
          preferences.maxTravelTime || null,
          preferences.minMentorRating || null,
          preferences.preferredMentorExperience || null,
          preferences.sessionFrequency || null,
          preferences.learningStyle || null,
          now,
          now
        ]);

        await client.query('COMMIT');
        return this.mapPreferencesFromDb(result.rows[0]);
      } else {
        // Update existing preferences
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        if (preferences.preferredExpertiseAreas !== undefined) {
          updateFields.push(`preferred_expertise_areas = $${paramCount++}`);
          values.push(JSON.stringify(preferences.preferredExpertiseAreas));
        }
        if (preferences.preferredSessionTypes !== undefined) {
          updateFields.push(`preferred_session_types = $${paramCount++}`);
          values.push(JSON.stringify(preferences.preferredSessionTypes));
        }
        if (preferences.preferredTimeSlots !== undefined) {
          updateFields.push(`preferred_time_slots = $${paramCount++}`);
          values.push(JSON.stringify(preferences.preferredTimeSlots));
        }
        if (preferences.maxTravelTime !== undefined) {
          updateFields.push(`max_travel_time = $${paramCount++}`);
          values.push(preferences.maxTravelTime);
        }
        if (preferences.minMentorRating !== undefined) {
          updateFields.push(`min_mentor_rating = $${paramCount++}`);
          values.push(preferences.minMentorRating);
        }
        if (preferences.preferredMentorExperience !== undefined) {
          updateFields.push(`preferred_mentor_experience = $${paramCount++}`);
          values.push(preferences.preferredMentorExperience);
        }
        if (preferences.sessionFrequency !== undefined) {
          updateFields.push(`session_frequency = $${paramCount++}`);
          values.push(preferences.sessionFrequency);
        }
        if (preferences.learningStyle !== undefined) {
          updateFields.push(`learning_style = $${paramCount++}`);
          values.push(preferences.learningStyle);
        }

        updateFields.push(`updated_at = $${paramCount++}`);
        values.push(now);
        values.push(userId);

        const result = await client.query(`
          UPDATE matching_preferences 
          SET ${updateFields.join(', ')} 
          WHERE user_id = $${paramCount}
          RETURNING *
        `, values);

        await client.query('COMMIT');
        return this.mapPreferencesFromDb(result.rows[0]);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordFeedback(studentId: string, sessionId: string, feedback: Omit<MatchingFeedback, 'studentId' | 'sessionId' | 'createdAt'>): Promise<void> {
    const client = await this.db.getClient();
    
    try {
      await client.query(`
        INSERT INTO matching_feedback (
          session_id, student_id, rating, attended, helpful, match_quality, feedback, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (session_id, student_id) 
        DO UPDATE SET 
          rating = EXCLUDED.rating,
          attended = EXCLUDED.attended,
          helpful = EXCLUDED.helpful,
          match_quality = EXCLUDED.match_quality,
          feedback = EXCLUDED.feedback,
          created_at = EXCLUDED.created_at
      `, [
        sessionId,
        studentId,
        feedback.rating,
        feedback.attended,
        feedback.helpful,
        feedback.matchQuality,
        feedback.feedback || null,
        new Date()
      ]);
    } finally {
      client.release();
    }
  }

  private mapPreferencesFromDb(row: any): MatchingPreferences {
    return {
      userId: row.user_id,
      preferredExpertiseAreas: JSON.parse(row.preferred_expertise_areas || '[]'),
      preferredSessionTypes: JSON.parse(row.preferred_session_types || '[]'),
      preferredTimeSlots: JSON.parse(row.preferred_time_slots || '[]'),
      maxTravelTime: row.max_travel_time,
      minMentorRating: row.min_mentor_rating,
      preferredMentorExperience: row.preferred_mentor_experience,
      sessionFrequency: row.session_frequency,
      learningStyle: row.learning_style,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}