import { Pool } from 'pg';
import { DatabaseOptimization, MentorProfile, StudentProfile, UserRole } from '@mentor-platform/shared';

// Types defined locally since they're not in shared package
export type ProfileData = MentorProfile | StudentProfile;
export type ProfileUpdates = Partial<MentorProfile> | Partial<StudentProfile>;

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  profile: ProfileData;
  preferences: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class ProfileService {
  private get db(): Pool {
    return DatabaseOptimization.getPool();
  }

  constructor() { }

  async createProfile(userId: string, profileData: ProfileData): Promise<UserProfile> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get user basic info
      const userResult = await client.query(
        'SELECT id, email, role, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      if (user.role === 'MENTOR') {
        const mentorProfile = await this.createMentorProfile(client, userId, profileData as MentorProfile);
        await client.query('COMMIT');

        return {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          profile: mentorProfile,
          preferences: {},
          createdAt: user.created_at,
          updatedAt: new Date()
        };
      } else {
        const studentProfile = await this.createStudentProfile(client, userId, profileData as StudentProfile);
        await client.query('COMMIT');

        return {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          profile: studentProfile,
          preferences: {},
          createdAt: user.created_at,
          updatedAt: new Date()
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createMentorProfile(client: any, userId: string, profileData: MentorProfile): Promise<MentorProfile> {
    const result = await client.query(`
      INSERT INTO mentor_profiles (
        user_id, first_name, last_name, bio, expertise_areas, 
        years_of_experience, hourly_rate, profile_image_url, 
        social_links, rating, total_sessions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      userId,
      profileData.firstName,
      profileData.lastName,
      profileData.bio,
      JSON.stringify(profileData.expertiseAreas),
      profileData.yearsOfExperience,
      profileData.hourlyRate || null,
      profileData.profileImageUrl || null,
      JSON.stringify(profileData.socialLinks || []),
      0, // initial rating
      0  // initial total sessions
    ]);

    const profile = result.rows[0];

    // Insert availability slots if provided
    if (profileData.availability && profileData.availability.length > 0) {
      for (const slot of profileData.availability) {
        await client.query(`
          INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time, timezone)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, slot.dayOfWeek, slot.startTime, slot.endTime, slot.timezone]);
      }
    }

    return {
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      bio: profile.bio,
      expertiseAreas: JSON.parse(profile.expertise_areas),
      yearsOfExperience: profile.years_of_experience,
      hourlyRate: profile.hourly_rate,
      availability: profileData.availability || [],
      profileImageUrl: profile.profile_image_url,
      socialLinks: JSON.parse(profile.social_links),
      rating: profile.rating,
      totalSessions: profile.total_sessions
    };
  }

  private async createStudentProfile(client: any, userId: string, profileData: StudentProfile): Promise<StudentProfile> {
    const result = await client.query(`
      INSERT INTO student_profiles (
        user_id, first_name, last_name, bio, learning_goals, 
        interests, current_level, profile_image_url, preferred_session_types
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId,
      profileData.firstName,
      profileData.lastName,
      profileData.bio,
      JSON.stringify(profileData.learningGoals),
      JSON.stringify(profileData.interests),
      profileData.currentLevel,
      profileData.profileImageUrl || null,
      JSON.stringify(profileData.preferredSessionTypes || [])
    ]);

    const profile = result.rows[0];

    return {
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      bio: profile.bio,
      learningGoals: JSON.parse(profile.learning_goals),
      interests: JSON.parse(profile.interests),
      currentLevel: profile.current_level,
      profileImageUrl: profile.profile_image_url,
      preferredSessionTypes: JSON.parse(profile.preferred_session_types)
    };
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const client = await this.db.connect();

    try {
      // Get user basic info
      const userResult = await client.query(
        'SELECT id, email, role, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return null;
      }

      const user = userResult.rows[0];

      if (user.role === 'MENTOR') {
        const mentorProfile = await this.getMentorProfile(client, userId);
        if (!mentorProfile) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          profile: mentorProfile,
          preferences: {},
          createdAt: user.created_at,
          updatedAt: new Date()
        };
      } else {
        const studentProfile = await this.getStudentProfile(client, userId);
        if (!studentProfile) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role as UserRole,
          profile: studentProfile,
          preferences: {},
          createdAt: user.created_at,
          updatedAt: new Date()
        };
      }
    } finally {
      client.release();
    }
  }

  private async getMentorProfile(client: any, userId: string): Promise<MentorProfile | null> {
    const result = await client.query(
      'SELECT * FROM mentor_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const profile = result.rows[0];

    // Get availability slots
    const availabilityResult = await client.query(
      'SELECT * FROM mentor_availability WHERE mentor_id = $1 ORDER BY day_of_week, start_time',
      [userId]
    );

    const availability = availabilityResult.rows.map((row: any) => ({
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone
    }));

    return {
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      bio: profile.bio,
      expertiseAreas: JSON.parse(profile.expertise_areas),
      yearsOfExperience: profile.years_of_experience,
      hourlyRate: profile.hourly_rate,
      availability,
      profileImageUrl: profile.profile_image_url,
      socialLinks: JSON.parse(profile.social_links),
      rating: profile.rating,
      totalSessions: profile.total_sessions
    };
  }

  private async getStudentProfile(client: any, userId: string): Promise<StudentProfile | null> {
    const result = await client.query(
      'SELECT * FROM student_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const profile = result.rows[0];

    return {
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      bio: profile.bio,
      learningGoals: JSON.parse(profile.learning_goals),
      interests: JSON.parse(profile.interests),
      currentLevel: profile.current_level,
      profileImageUrl: profile.profile_image_url,
      preferredSessionTypes: JSON.parse(profile.preferred_session_types)
    };
  }

  async updateProfile(userId: string, updates: ProfileUpdates): Promise<UserProfile> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get user role
      const userResult = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const userRole = userResult.rows[0].role;

      if (userRole === 'MENTOR') {
        await this.updateMentorProfile(client, userId, updates);
      } else {
        await this.updateStudentProfile(client, userId, updates);
      }

      await client.query('COMMIT');

      const updatedProfile = await this.getProfile(userId);
      if (!updatedProfile) {
        throw new Error('Failed to retrieve updated profile');
      }

      return updatedProfile;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async updateMentorProfile(client: any, userId: string, updates: any): Promise<void> {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.firstName !== undefined) {
      updateFields.push(`first_name = $${paramCount++}`);
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      updateFields.push(`last_name = $${paramCount++}`);
      values.push(updates.lastName);
    }
    if (updates.bio !== undefined) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(updates.bio);
    }
    if (updates.expertiseAreas !== undefined) {
      updateFields.push(`expertise_areas = $${paramCount++}`);
      values.push(JSON.stringify(updates.expertiseAreas));
    }
    if (updates.yearsOfExperience !== undefined) {
      updateFields.push(`years_of_experience = $${paramCount++}`);
      values.push(updates.yearsOfExperience);
    }
    if (updates.hourlyRate !== undefined) {
      updateFields.push(`hourly_rate = $${paramCount++}`);
      values.push(updates.hourlyRate);
    }
    if (updates.profileImageUrl !== undefined) {
      updateFields.push(`profile_image_url = $${paramCount++}`);
      values.push(updates.profileImageUrl);
    }
    if (updates.socialLinks !== undefined) {
      updateFields.push(`social_links = $${paramCount++}`);
      values.push(JSON.stringify(updates.socialLinks));
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(userId);

      await client.query(`
        UPDATE mentor_profiles 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${paramCount}
      `, values);
    }

    // Update availability if provided
    if (updates.availability !== undefined) {
      // Delete existing availability
      await client.query('DELETE FROM mentor_availability WHERE mentor_id = $1', [userId]);

      // Insert new availability
      for (const slot of updates.availability) {
        await client.query(`
          INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time, timezone)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, slot.dayOfWeek, slot.startTime, slot.endTime, slot.timezone]);
      }
    }
  }

  private async updateStudentProfile(client: any, userId: string, updates: any): Promise<void> {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.firstName !== undefined) {
      updateFields.push(`first_name = $${paramCount++}`);
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      updateFields.push(`last_name = $${paramCount++}`);
      values.push(updates.lastName);
    }
    if (updates.bio !== undefined) {
      updateFields.push(`bio = $${paramCount++}`);
      values.push(updates.bio);
    }
    if (updates.learningGoals !== undefined) {
      updateFields.push(`learning_goals = $${paramCount++}`);
      values.push(JSON.stringify(updates.learningGoals));
    }
    if (updates.interests !== undefined) {
      updateFields.push(`interests = $${paramCount++}`);
      values.push(JSON.stringify(updates.interests));
    }
    if (updates.currentLevel !== undefined) {
      updateFields.push(`current_level = $${paramCount++}`);
      values.push(updates.currentLevel);
    }
    if (updates.profileImageUrl !== undefined) {
      updateFields.push(`profile_image_url = $${paramCount++}`);
      values.push(updates.profileImageUrl);
    }
    if (updates.preferredSessionTypes !== undefined) {
      updateFields.push(`preferred_session_types = $${paramCount++}`);
      values.push(JSON.stringify(updates.preferredSessionTypes));
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(userId);

      await client.query(`
        UPDATE student_profiles 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${paramCount}
      `, values);
    }
  }

  async searchUsers(criteria: any): Promise<UserProfile[]> {
    const client = await this.db.connect();

    try {
      let query = `
        SELECT u.id, u.email, u.role, u.created_at,
               COALESCE(mp.first_name, sp.first_name) as first_name,
               COALESCE(mp.last_name, sp.last_name) as last_name,
               COALESCE(mp.bio, sp.bio) as bio,
               mp.expertise_areas, mp.rating, mp.total_sessions,
               sp.learning_goals, sp.interests, sp.current_level
        FROM users u
        LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        WHERE (mp.user_id IS NOT NULL OR sp.user_id IS NOT NULL)
      `;

      const values = [];
      let paramCount = 1;

      if (criteria.role) {
        query += ` AND u.role = $${paramCount++}`;
        values.push(criteria.role.toUpperCase());
      }

      if (criteria.expertiseAreas && criteria.expertiseAreas.length > 0) {
        query += ` AND mp.expertise_areas::jsonb ?| $${paramCount++}`;
        values.push(criteria.expertiseAreas);
      }

      if (criteria.searchTerm) {
        query += ` AND (
          COALESCE(mp.first_name, sp.first_name) ILIKE $${paramCount} OR
          COALESCE(mp.last_name, sp.last_name) ILIKE $${paramCount} OR
          COALESCE(mp.bio, sp.bio) ILIKE $${paramCount}
        )`;
        values.push(`%${criteria.searchTerm}%`);
        paramCount++;
      }

      query += ' ORDER BY u.created_at DESC';

      if (criteria.limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(criteria.limit);
      }

      if (criteria.offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(criteria.offset);
      }

      const result = await client.query(query, values);

      return result.rows.map(row => ({
        id: row.id,
        email: row.email,
        role: row.role as UserRole,
        profile: row.role === 'MENTOR' ? {
          userId: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          bio: row.bio,
          expertiseAreas: JSON.parse(row.expertise_areas || '[]'),
          yearsOfExperience: 0,
          availability: [],
          socialLinks: [],
          rating: row.rating || 0,
          totalSessions: row.total_sessions || 0
        } : {
          userId: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          bio: row.bio,
          learningGoals: JSON.parse(row.learning_goals || '[]'),
          interests: JSON.parse(row.interests || '[]'),
          currentLevel: row.current_level || 'BEGINNER',
          preferredSessionTypes: []
        },
        preferences: {},
        createdAt: row.created_at,
        updatedAt: new Date()
      }));
    } finally {
      client.release();
    }
  }
}