import { Pool } from 'pg';
import { DatabaseOptimization } from '@mentor-platform/shared';

export interface PrivacySettings {
  userId: string;
  profileVisibility: 'PUBLIC' | 'PRIVATE' | 'MENTORS_ONLY' | 'STUDENTS_ONLY';
  showEmail: boolean;
  showSocialLinks: boolean;
  showAvailability: boolean;
  allowDirectMessages: boolean;
  allowSessionInvites: boolean;
  searchable: boolean;
  showInRecommendations: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrivacyUpdateData {
  profileVisibility?: 'PUBLIC' | 'PRIVATE' | 'MENTORS_ONLY' | 'STUDENTS_ONLY';
  showEmail?: boolean;
  showSocialLinks?: boolean;
  showAvailability?: boolean;
  allowDirectMessages?: boolean;
  allowSessionInvites?: boolean;
  searchable?: boolean;
  showInRecommendations?: boolean;
}

export class PrivacyService {
  private get db(): Pool {
    return DatabaseOptimization.getPool();
  }

  constructor() { }

  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    const client = await this.db.connect();

    try {
      const result = await client.query(
        'SELECT * FROM privacy_settings WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default privacy settings if none exist
        return await this.createDefaultPrivacySettings(userId);
      }

      const settings = result.rows[0];
      return {
        userId: settings.user_id,
        profileVisibility: settings.profile_visibility,
        showEmail: settings.show_email,
        showSocialLinks: settings.show_social_links,
        showAvailability: settings.show_availability,
        allowDirectMessages: settings.allow_direct_messages,
        allowSessionInvites: settings.allow_session_invites,
        searchable: settings.searchable,
        showInRecommendations: settings.show_in_recommendations,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      };
    } finally {
      client.release();
    }
  }

  private async createDefaultPrivacySettings(userId: string): Promise<PrivacySettings> {
    const client = await this.db.connect();

    try {
      const result = await client.query(`
        INSERT INTO privacy_settings (
          user_id, profile_visibility, show_email, show_social_links, 
          show_availability, allow_direct_messages, allow_session_invites,
          searchable, show_in_recommendations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        userId,
        'PUBLIC',     // Default to public profile
        false,        // Don't show email by default
        true,         // Show social links by default
        true,         // Show availability by default
        true,         // Allow direct messages by default
        true,         // Allow session invites by default
        true,         // Searchable by default
        true          // Show in recommendations by default
      ]);

      const settings = result.rows[0];
      return {
        userId: settings.user_id,
        profileVisibility: settings.profile_visibility,
        showEmail: settings.show_email,
        showSocialLinks: settings.show_social_links,
        showAvailability: settings.show_availability,
        allowDirectMessages: settings.allow_direct_messages,
        allowSessionInvites: settings.allow_session_invites,
        searchable: settings.searchable,
        showInRecommendations: settings.show_in_recommendations,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      };
    } finally {
      client.release();
    }
  }

  async updatePrivacySettings(userId: string, updates: PrivacyUpdateData): Promise<PrivacySettings> {
    const client = await this.db.connect();

    try {
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (updates.profileVisibility !== undefined) {
        updateFields.push(`profile_visibility = $${paramCount++}`);
        values.push(updates.profileVisibility);
      }
      if (updates.showEmail !== undefined) {
        updateFields.push(`show_email = $${paramCount++}`);
        values.push(updates.showEmail);
      }
      if (updates.showSocialLinks !== undefined) {
        updateFields.push(`show_social_links = $${paramCount++}`);
        values.push(updates.showSocialLinks);
      }
      if (updates.showAvailability !== undefined) {
        updateFields.push(`show_availability = $${paramCount++}`);
        values.push(updates.showAvailability);
      }
      if (updates.allowDirectMessages !== undefined) {
        updateFields.push(`allow_direct_messages = $${paramCount++}`);
        values.push(updates.allowDirectMessages);
      }
      if (updates.allowSessionInvites !== undefined) {
        updateFields.push(`allow_session_invites = $${paramCount++}`);
        values.push(updates.allowSessionInvites);
      }
      if (updates.searchable !== undefined) {
        updateFields.push(`searchable = $${paramCount++}`);
        values.push(updates.searchable);
      }
      if (updates.showInRecommendations !== undefined) {
        updateFields.push(`show_in_recommendations = $${paramCount++}`);
        values.push(updates.showInRecommendations);
      }

      if (updateFields.length === 0) {
        // No updates provided, return current settings
        return await this.getPrivacySettings(userId);
      }

      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(userId);

      const result = await client.query(`
        UPDATE privacy_settings 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Privacy settings not found');
      }

      const settings = result.rows[0];
      return {
        userId: settings.user_id,
        profileVisibility: settings.profile_visibility,
        showEmail: settings.show_email,
        showSocialLinks: settings.show_social_links,
        showAvailability: settings.show_availability,
        allowDirectMessages: settings.allow_direct_messages,
        allowSessionInvites: settings.allow_session_invites,
        searchable: settings.searchable,
        showInRecommendations: settings.show_in_recommendations,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      };
    } finally {
      client.release();
    }
  }

  async canViewProfile(viewerUserId: string, targetUserId: string, targetUserRole: string): Promise<boolean> {
    // Users can always view their own profile
    if (viewerUserId === targetUserId) {
      return true;
    }

    const privacySettings = await this.getPrivacySettings(targetUserId);

    switch (privacySettings.profileVisibility) {
      case 'PUBLIC':
        return true;
      case 'PRIVATE':
        return false;
      case 'MENTORS_ONLY':
        // Check if viewer is a mentor
        return await this.isUserRole(viewerUserId, 'MENTOR');
      case 'STUDENTS_ONLY':
        // Check if viewer is a student
        return await this.isUserRole(viewerUserId, 'STUDENT');
      default:
        return false;
    }
  }

  async canSendDirectMessage(senderUserId: string, recipientUserId: string): Promise<boolean> {
    const privacySettings = await this.getPrivacySettings(recipientUserId);
    return privacySettings.allowDirectMessages;
  }

  async canSendSessionInvite(senderUserId: string, recipientUserId: string): Promise<boolean> {
    const privacySettings = await this.getPrivacySettings(recipientUserId);
    return privacySettings.allowSessionInvites;
  }

  async isSearchable(userId: string): Promise<boolean> {
    const privacySettings = await this.getPrivacySettings(userId);
    return privacySettings.searchable;
  }

  async showInRecommendations(userId: string): Promise<boolean> {
    const privacySettings = await this.getPrivacySettings(userId);
    return privacySettings.showInRecommendations;
  }

  private async isUserRole(userId: string, role: string): Promise<boolean> {
    const client = await this.db.connect();

    try {
      const result = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      return result.rows.length > 0 && result.rows[0].role === role;
    } finally {
      client.release();
    }
  }

  async applyPrivacyFilter(viewerUserId: string, targetProfile: any): Promise<any> {
    const privacySettings = await this.getPrivacySettings(targetProfile.id);

    // If viewer is the profile owner, return full profile
    if (viewerUserId === targetProfile.id) {
      return targetProfile;
    }

    // Apply privacy filters
    const filteredProfile = { ...targetProfile };

    if (!privacySettings.showEmail) {
      delete filteredProfile.email;
    }

    if (!privacySettings.showSocialLinks && filteredProfile.profile.socialLinks) {
      delete filteredProfile.profile.socialLinks;
    }

    if (!privacySettings.showAvailability && filteredProfile.profile.availability) {
      delete filteredProfile.profile.availability;
    }

    return filteredProfile;
  }
}