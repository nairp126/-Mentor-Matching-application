import { PaginatedResponse } from '@mentor-platform/shared';
import { AppError } from '../middleware/errorHandler';
import Redis from 'ioredis';
import { Pool } from 'pg';

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mentor_platform',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20
});

export class UserManagementService {
  private db: Pool;
  private redis: Redis;

  constructor() {
    this.db = pool;
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3
    });
  }

  /**
   * Get paginated list of users with filtering
   */
  async getUsers(params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, role, status, sortBy, sortOrder, search } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE u.deleted_at IS NULL';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (role) {
        whereClause += ` AND u.role = $${paramIndex}`;
        queryParams.push(role);
        paramIndex++;
      }

      if (status) {
        if (status === 'ACTIVE') {
          whereClause += ` AND u.suspended_at IS NULL`;
        } else if (status === 'SUSPENDED') {
          whereClause += ` AND u.suspended_at IS NOT NULL`;
        }
      }

      if (search) {
        whereClause += ` AND (
          u.email ILIKE $${paramIndex} OR 
          COALESCE(mp.first_name, sp.first_name) ILIKE $${paramIndex} OR 
          COALESCE(mp.last_name, sp.last_name) ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Build ORDER BY clause
      const validSortFields: Record<string, string> = {
        createdAt: 'u.created_at',
        lastLoginAt: 'u.last_login_at',
        email: 'u.email',
        firstName: 'COALESCE(mp.first_name, sp.first_name)',
        lastName: 'COALESCE(mp.last_name, sp.last_name)'
      };

      const orderBy = validSortFields[sortBy] || 'u.created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM users u
        LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get users
      const usersQuery = `
        SELECT 
          u.id,
          u.email,
          u.role,
          u.email_verified,
          u.mfa_enabled,
          u.created_at,
          u.updated_at,
          u.last_login_at,
          u.suspended_at,
          COALESCE(mp.first_name, sp.first_name) as first_name,
          COALESCE(mp.last_name, sp.last_name) as last_name,
          COALESCE(mp.profile_image_url, sp.profile_image_url) as profile_image_url,
          mp.expertise_areas,
          mp.years_of_experience,
          mp.rating,
          mp.total_sessions,
          sp.learning_goals,
          sp.current_level
        FROM users u
        LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        ${whereClause}
        ORDER BY ${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const usersResult = await this.db.query(usersQuery, queryParams);

      return {
        items: usersResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting users:', error);
      throw new AppError('Failed to get users', 500, 'GET_USERS_ERROR');
    }
  }

  /**
   * Search users by various criteria
   */
  async searchUsers(query: string, filters: any = {}, limit: number = 20): Promise<any[]> {
    try {
      let whereClause = 'WHERE u.deleted_at IS NULL';
      const queryParams: any[] = [`%${query}%`];
      let paramIndex = 2;

      // Add search condition
      whereClause += ` AND (
        u.email ILIKE $1 OR 
        COALESCE(mp.first_name, sp.first_name) ILIKE $1 OR 
        COALESCE(mp.last_name, sp.last_name) ILIKE $1 OR
        mp.bio ILIKE $1 OR
        sp.bio ILIKE $1
      )`;

      // Add filters
      if (filters.role && filters.role.length > 0) {
        whereClause += ` AND u.role = ANY($${paramIndex})`;
        queryParams.push(filters.role);
        paramIndex++;
      }

      if (filters.status && filters.status.length > 0) {
        const statusConditions = filters.status.map((status: string) => {
          if (status === 'ACTIVE') return 'u.suspended_at IS NULL';
          if (status === 'SUSPENDED') return 'u.suspended_at IS NOT NULL';
          return 'FALSE';
        }).join(' OR ');

        if (statusConditions !== 'FALSE') {
          whereClause += ` AND (${statusConditions})`;
        }
      }

      if (filters.dateRange) {
        whereClause += ` AND u.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(filters.dateRange.start, filters.dateRange.end);
        paramIndex += 2;
      }

      if (filters.expertiseAreas && filters.expertiseAreas.length > 0) {
        whereClause += ` AND mp.expertise_areas && $${paramIndex}`;
        queryParams.push(filters.expertiseAreas);
        paramIndex++;
      }

      const searchQuery = `
        SELECT 
          u.id,
          u.email,
          u.role,
          u.created_at,
          u.last_login_at,
          u.suspended_at,
          COALESCE(mp.first_name, sp.first_name) as first_name,
          COALESCE(mp.last_name, sp.last_name) as last_name,
          COALESCE(mp.profile_image_url, sp.profile_image_url) as profile_image_url,
          mp.expertise_areas,
          mp.rating,
          sp.learning_goals,
          sp.current_level,
          ts_rank(
            to_tsvector('english', 
              COALESCE(mp.first_name, sp.first_name, '') || ' ' ||
              COALESCE(mp.last_name, sp.last_name, '') || ' ' ||
              COALESCE(mp.bio, sp.bio, '') || ' ' ||
              u.email
            ),
            plainto_tsquery('english', $1)
          ) as relevance_score
        FROM users u
        LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        ${whereClause}
        ORDER BY relevance_score DESC, u.created_at DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);
      const result = await this.db.query(searchQuery, queryParams);

      return result.rows;
    } catch (error) {
      console.error('Error searching users:', error);
      throw new AppError('Failed to search users', 500, 'SEARCH_USERS_ERROR');
    }
  }

  /**
   * Get detailed user information by ID
   */
  async getUserById(userId: string): Promise<any> {
    try {
      const userQuery = `
        SELECT 
          u.*,
          COALESCE(mp.first_name, sp.first_name) as first_name,
          COALESCE(mp.last_name, sp.last_name) as last_name,
          COALESCE(mp.bio, sp.bio) as bio,
          COALESCE(mp.profile_image_url, sp.profile_image_url) as profile_image_url,
          mp.expertise_areas,
          mp.years_of_experience,
          mp.hourly_rate,
          mp.availability,
          mp.social_links,
          mp.rating,
          mp.total_sessions,
          sp.learning_goals,
          sp.interests,
          sp.current_level,
          sp.preferred_session_types
        FROM users u
        LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        WHERE u.id = $1
      `;

      const userResult = await this.db.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const user = userResult.rows[0];

      // Get additional user statistics
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM sessions WHERE mentor_id = $1 OR $1 = ANY(
            SELECT jsonb_array_elements_text(registered_students::jsonb)
          )) as total_sessions,
          (SELECT COUNT(*) FROM messages WHERE from_user_id = $1) as messages_sent,
          (SELECT COUNT(*) FROM notifications WHERE user_id = $1) as notifications_received,
          (SELECT MAX(created_at) FROM audit_logs WHERE user_id = $1) as last_activity
      `;

      const statsResult = await this.db.query(statsQuery, [userId]);
      const stats = statsResult.rows[0];

      return {
        ...user,
        statistics: stats
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error getting user by ID:', error);
      throw new AppError('Failed to get user', 500, 'GET_USER_ERROR');
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId: string, updates: any): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Update user table
        const userUpdates = [];
        const userParams = [];
        let paramIndex = 1;

        if (updates.email) {
          userUpdates.push(`email = $${paramIndex}`);
          userParams.push(updates.email);
          paramIndex++;
        }

        if (updates.role) {
          userUpdates.push(`role = $${paramIndex}`);
          userParams.push(updates.role);
          paramIndex++;
        }

        if (updates.emailVerified !== undefined) {
          userUpdates.push(`email_verified = $${paramIndex}`);
          userParams.push(updates.emailVerified);
          paramIndex++;
        }

        if (updates.status) {
          if (updates.status === 'SUSPENDED') {
            userUpdates.push(`suspended_at = NOW()`);
          } else if (updates.status === 'ACTIVE') {
            userUpdates.push(`suspended_at = NULL`);
          }
        }

        if (userUpdates.length > 0) {
          userUpdates.push(`updated_at = NOW()`);
          userParams.push(userId);

          const userQuery = `
            UPDATE users 
            SET ${userUpdates.join(', ')}
            WHERE id = $${paramIndex}
          `;

          await client.query(userQuery, userParams);
        }

        // Update profile if provided
        if (updates.profile) {
          const user = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
          const userRole = user.rows[0]?.role;

          if (userRole === 'MENTOR') {
            await this.updateMentorProfile(client, userId, updates.profile);
          } else if (userRole === 'STUDENT') {
            await this.updateStudentProfile(client, userId, updates.profile);
          }
        }

        // Add admin notes if provided
        if (updates.notes) {
          await client.query(`
            INSERT INTO admin_notes (user_id, note, created_by, created_at)
            VALUES ($1, $2, $3, NOW())
          `, [userId, updates.notes, 'admin']); // In real app, use actual admin ID
        }

        await client.query('COMMIT');

        // Clear user cache
        await this.redis.del(`user:${userId}`);

        return await this.getUserById(userId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating user:', error);
      throw new AppError('Failed to update user', 500, 'UPDATE_USER_ERROR');
    }
  }

  /**
   * Delete user (soft delete by default)
   */
  async deleteUser(userId: string, permanent: boolean = false): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        if (permanent) {
          // Hard delete - remove all user data
          await client.query('DELETE FROM mentor_profiles WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM student_profiles WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM sessions WHERE mentor_id = $1', [userId]);
          await client.query('DELETE FROM messages WHERE from_user_id = $1 OR to_user_id = $1', [userId]);
          await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM users WHERE id = $1', [userId]);
        } else {
          // Soft delete - mark as deleted
          await client.query(`
            UPDATE users 
            SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1
          `, [userId]);
        }

        await client.query('COMMIT');

        // Clear user cache
        await this.redis.del(`user:${userId}`);

        return {
          userId,
          deleted: true,
          permanent,
          deletedAt: new Date()
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      throw new AppError('Failed to delete user', 500, 'DELETE_USER_ERROR');
    }
  }

  /**
   * Suspend user account
   */
  async suspendUser(userId: string, suspensionData: any): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Calculate suspension end date if duration is provided
        let suspensionEndDate = null;
        if (suspensionData.duration) {
          suspensionEndDate = new Date();
          suspensionEndDate.setDate(suspensionEndDate.getDate() + suspensionData.duration);
        }

        // Update user suspension
        await client.query(`
          UPDATE users 
          SET suspended_at = NOW(), suspension_end_at = $1, updated_at = NOW()
          WHERE id = $2
        `, [suspensionEndDate, userId]);

        // Record suspension in admin actions
        await client.query(`
          INSERT INTO admin_actions (user_id, action_type, reason, details, created_at)
          VALUES ($1, 'SUSPEND', $2, $3, NOW())
        `, [userId, suspensionData.reason, JSON.stringify({
          duration: suspensionData.duration,
          endDate: suspensionEndDate
        })]);

        await client.query('COMMIT');

        // Send notification if requested
        if (suspensionData.notifyUser) {
          await this.sendUserNotification(userId, {
            type: 'ACCOUNT_SUSPENDED',
            title: 'Account Suspended',
            message: `Your account has been suspended. Reason: ${suspensionData.reason}`,
            priority: 'HIGH'
          });
        }

        // Clear user cache
        await this.redis.del(`user:${userId}`);

        return {
          userId,
          suspended: true,
          reason: suspensionData.reason,
          duration: suspensionData.duration,
          endDate: suspensionEndDate,
          suspendedAt: new Date()
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error suspending user:', error);
      throw new AppError('Failed to suspend user', 500, 'SUSPEND_USER_ERROR');
    }
  }

  /**
   * Activate suspended user account
   */
  async activateUser(userId: string, activationData: any): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Remove suspension
        await client.query(`
          UPDATE users 
          SET suspended_at = NULL, suspension_end_at = NULL, updated_at = NOW()
          WHERE id = $1
        `, [userId]);

        // Record activation in admin actions
        await client.query(`
          INSERT INTO admin_actions (user_id, action_type, reason, created_at)
          VALUES ($1, 'ACTIVATE', $2, NOW())
        `, [userId, activationData.reason || 'Account reactivated by admin']);

        await client.query('COMMIT');

        // Send notification if requested
        if (activationData.notifyUser) {
          await this.sendUserNotification(userId, {
            type: 'ACCOUNT_ACTIVATED',
            title: 'Account Activated',
            message: 'Your account has been reactivated. You can now access all platform features.',
            priority: 'MEDIUM'
          });
        }

        // Clear user cache
        await this.redis.del(`user:${userId}`);

        return {
          userId,
          activated: true,
          reason: activationData.reason,
          activatedAt: new Date()
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error activating user:', error);
      throw new AppError('Failed to activate user', 500, 'ACTIVATE_USER_ERROR');
    }
  }

  /**
   * Reset user password
   */
  async resetUserPassword(userId: string, resetData: any): Promise<any> {
    try {
      const bcrypt = require('bcrypt');

      // Generate temporary password if not provided
      const tempPassword = resetData.temporaryPassword || this.generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      await this.db.query(`
        UPDATE users 
        SET password_hash = $1, password_reset_required = $2, updated_at = NOW()
        WHERE id = $3
      `, [hashedPassword, resetData.forceReset, userId]);

      // Record password reset in admin actions
      await this.db.query(`
        INSERT INTO admin_actions (user_id, action_type, reason, created_at)
        VALUES ($1, 'PASSWORD_RESET', 'Password reset by admin', NOW())
      `, [userId]);

      // Send notification if requested
      if (resetData.notifyUser) {
        await this.sendUserNotification(userId, {
          type: 'PASSWORD_RESET',
          title: 'Password Reset',
          message: `Your password has been reset. Your temporary password is: ${tempPassword}`,
          priority: 'HIGH'
        });
      }

      return {
        userId,
        temporaryPassword: tempPassword,
        forceReset: resetData.forceReset,
        resetAt: new Date()
      };
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw new AppError('Failed to reset user password', 500, 'PASSWORD_RESET_ERROR');
    }
  }

  // Additional methods for user activity, sessions, messages, bulk operations, and statistics
  // would be implemented here following the same patterns...

  /**
   * Get user statistics overview
   */
  async getUserStats(): Promise<any> {
    try {
      const stats = await this.db.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN role = 'MENTOR' THEN 1 END) as total_mentors,
          COUNT(CASE WHEN role = 'STUDENT' THEN 1 END) as total_students,
          COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as total_admins,
          COUNT(CASE WHEN suspended_at IS NOT NULL THEN 1 END) as suspended_users,
          COUNT(CASE WHEN last_login_at > NOW() - INTERVAL '7 days' THEN 1 END) as active_last_week,
          COUNT(CASE WHEN last_login_at > NOW() - INTERVAL '30 days' THEN 1 END) as active_last_month,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
        FROM users 
        WHERE deleted_at IS NULL
      `);

      return stats.rows[0];
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw new AppError('Failed to get user statistics', 500, 'USER_STATS_ERROR');
    }
  }

  // Private helper methods
  private async updateMentorProfile(client: any, userId: string, profileData: any): Promise<void> {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (profileData.firstName) {
      updates.push(`first_name = $${paramIndex}`);
      params.push(profileData.firstName);
      paramIndex++;
    }

    if (profileData.lastName) {
      updates.push(`last_name = $${paramIndex}`);
      params.push(profileData.lastName);
      paramIndex++;
    }

    if (profileData.bio) {
      updates.push(`bio = $${paramIndex}`);
      params.push(profileData.bio);
      paramIndex++;
    }

    if (profileData.expertiseAreas) {
      updates.push(`expertise_areas = $${paramIndex}`);
      params.push(profileData.expertiseAreas);
      paramIndex++;
    }

    if (profileData.yearsOfExperience !== undefined) {
      updates.push(`years_of_experience = $${paramIndex}`);
      params.push(profileData.yearsOfExperience);
      paramIndex++;
    }

    if (profileData.hourlyRate !== undefined) {
      updates.push(`hourly_rate = $${paramIndex}`);
      params.push(profileData.hourlyRate);
      paramIndex++;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      params.push(userId);

      const query = `
        UPDATE mentor_profiles 
        SET ${updates.join(', ')}
        WHERE user_id = $${paramIndex}
      `;

      await client.query(query, params);
    }
  }

  private async updateStudentProfile(client: any, userId: string, profileData: any): Promise<void> {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (profileData.firstName) {
      updates.push(`first_name = $${paramIndex}`);
      params.push(profileData.firstName);
      paramIndex++;
    }

    if (profileData.lastName) {
      updates.push(`last_name = $${paramIndex}`);
      params.push(profileData.lastName);
      paramIndex++;
    }

    if (profileData.bio) {
      updates.push(`bio = $${paramIndex}`);
      params.push(profileData.bio);
      paramIndex++;
    }

    if (profileData.learningGoals) {
      updates.push(`learning_goals = $${paramIndex}`);
      params.push(profileData.learningGoals);
      paramIndex++;
    }

    if (profileData.interests) {
      updates.push(`interests = $${paramIndex}`);
      params.push(profileData.interests);
      paramIndex++;
    }

    if (profileData.currentLevel) {
      updates.push(`current_level = $${paramIndex}`);
      params.push(profileData.currentLevel);
      paramIndex++;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      params.push(userId);

      const query = `
        UPDATE student_profiles 
        SET ${updates.join(', ')}
        WHERE user_id = $${paramIndex}
      `;

      await client.query(query, params);
    }
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async sendUserNotification(userId: string, notification: any): Promise<void> {
    // This would integrate with the notification service
    // For now, we'll just log it
    console.log(`Sending notification to user ${userId}:`, notification);
  }

  // Placeholder methods for remaining functionality
  async getUserActivity(userId: string, params: any): Promise<any> {
    // Implementation would go here
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getUserSessions(userId: string, params: any): Promise<any> {
    // Implementation would go here
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getUserMessages(userId: string, params: any): Promise<any> {
    // Implementation would go here
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async bulkSuspendUsers(data: any): Promise<any> {
    // Implementation would go here
    return { processed: data.userIds.length, successful: data.userIds.length, failed: 0 };
  }

  async bulkActivateUsers(data: any): Promise<any> {
    // Implementation would go here
    return { processed: data.userIds.length, successful: data.userIds.length, failed: 0 };
  }

  async bulkNotifyUsers(data: any): Promise<any> {
    // Implementation would go here
    return { processed: data.userIds.length, successful: data.userIds.length, failed: 0 };
  }

  async getUserGrowthStats(period: string, range: number): Promise<any> {
    // Implementation would go here
    return { periods: [], data: [] };
  }

  async getUserEngagementStats(period: string, role?: string): Promise<any> {
    // Implementation would go here
    return { engagement: 0, sessions: 0, messages: 0 };
  }
}