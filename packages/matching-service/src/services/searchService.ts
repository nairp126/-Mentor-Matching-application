import { DatabaseManager } from '@mentor-platform/shared';

export interface SearchQuery {
  query?: string;
  expertiseAreas?: string[];
  sessionType?: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  mentorRating?: number;
  availability?: {
    startDate?: Date;
    endDate?: Date;
    dayOfWeek?: number[];
    timeRange?: {
      start: string;
      end: string;
    };
  };
  location?: {
    latitude?: number;
    longitude?: number;
    radius?: number; // in km
  };
  priceRange?: {
    min?: number;
    max?: number;
  };
  mentorExperience?: {
    min?: number;
    max?: number;
  };
  sortBy?: 'relevance' | 'rating' | 'price' | 'date' | 'experience';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  sessions: SearchResultSession[];
  mentors: SearchResultMentor[];
  total: number;
  facets: SearchFacets;
}

export interface SearchResultSession {
  id: string;
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: string;
  scheduledAt: Date;
  duration: number;
  capacity: number;
  currentRegistrations: number;
  mentor: {
    id: string;
    name: string;
    rating: number;
    totalSessions: number;
  };
  relevanceScore?: number;
}

export interface SearchResultMentor {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  expertiseAreas: string[];
  rating: number;
  totalSessions: number;
  yearsOfExperience: number;
  hourlyRate?: number;
  availableSessions: number;
  relevanceScore?: number;
}

export interface SearchFacets {
  expertiseAreas: { [key: string]: number };
  sessionTypes: { [key: string]: number };
  ratingRanges: { [key: string]: number };
  priceRanges: { [key: string]: number };
  experienceRanges: { [key: string]: number };
}

export class SearchService {
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

  async searchSessions(searchQuery: SearchQuery): Promise<SearchResult> {
    const client = await this.db.getClient();
    
    try {
      const { query, values } = this.buildSessionSearchQuery(searchQuery);
      
      // Execute main search query
      const searchResult = await client.query(query, values);
      
      // Get total count (simplified - remove LIMIT/OFFSET for count)
      const countQuery = query.replace(/ORDER BY.*$/s, '').replace(/LIMIT.*$/s, '');
      const countValues = values.slice(0, -2); // Remove LIMIT and OFFSET values
      const countResult = await client.query(`SELECT COUNT(*) as total FROM (${countQuery}) as count_query`, countValues);
      
      const sessions = searchResult.rows.map((row: any) => this.mapSessionSearchResult(row, searchQuery));
      
      // Get facets
      const facets = await this.getSessionSearchFacets(client);
      
      return {
        sessions,
        mentors: [], // Sessions search doesn't return mentors directly
        total: parseInt(countResult.rows[0].total),
        facets
      };
    } finally {
      client.release();
    }
  }

  async searchMentors(searchQuery: SearchQuery): Promise<SearchResult> {
    const client = await this.db.getClient();
    
    try {
      const { query, values } = this.buildMentorSearchQuery(searchQuery);
      
      // Execute main search query
      const searchResult = await client.query(query, values);
      
      // Get total count (simplified - remove LIMIT/OFFSET for count)
      const countQuery = query.replace(/ORDER BY.*$/s, '').replace(/LIMIT.*$/s, '');
      const countValues = values.slice(0, -2); // Remove LIMIT and OFFSET values
      const countResult = await client.query(`SELECT COUNT(*) as total FROM (${countQuery}) as count_query`, countValues);
      
      const mentors = searchResult.rows.map((row: any) => this.mapMentorSearchResult(row, searchQuery));
      
      // Get facets
      const facets = await this.getMentorSearchFacets(client);
      
      return {
        sessions: [], // Mentor search doesn't return sessions directly
        mentors,
        total: parseInt(countResult.rows[0].total),
        facets
      };
    } finally {
      client.release();
    }
  }

  private buildSessionSearchQuery(searchQuery: SearchQuery): { query: string; values: any[] } {
    let query = `
      SELECT 
        s.id, s.title, s.description, s.expertise_areas, s.session_type,
        s.scheduled_at, s.duration, s.capacity, s.current_registrations,
        mp.user_id as mentor_id, mp.first_name, mp.last_name, mp.rating, mp.total_sessions
      FROM sessions s
      JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      WHERE s.status = 'SCHEDULED' 
        AND s.scheduled_at > NOW()
        AND s.current_registrations < s.capacity
    `;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Text search
    if (searchQuery.query) {
      conditions.push(`(
        s.title ILIKE $${paramCount} OR 
        s.description ILIKE $${paramCount} OR 
        mp.first_name ILIKE $${paramCount} OR 
        mp.last_name ILIKE $${paramCount}
      )`);
      values.push(`%${searchQuery.query}%`);
      paramCount++;
    }

    // Expertise areas
    if (searchQuery.expertiseAreas && searchQuery.expertiseAreas.length > 0) {
      conditions.push(`s.expertise_areas::jsonb ?| $${paramCount}`);
      values.push(searchQuery.expertiseAreas);
      paramCount++;
    }

    // Session type
    if (searchQuery.sessionType) {
      conditions.push(`s.session_type = $${paramCount}`);
      values.push(searchQuery.sessionType);
      paramCount++;
    }

    // Mentor rating
    if (searchQuery.mentorRating) {
      conditions.push(`mp.rating >= $${paramCount}`);
      values.push(searchQuery.mentorRating);
      paramCount++;
    }

    // Availability filters
    if (searchQuery.availability) {
      if (searchQuery.availability.startDate) {
        conditions.push(`s.scheduled_at >= $${paramCount}`);
        values.push(searchQuery.availability.startDate);
        paramCount++;
      }
      
      if (searchQuery.availability.endDate) {
        conditions.push(`s.scheduled_at <= $${paramCount}`);
        values.push(searchQuery.availability.endDate);
        paramCount++;
      }
      
      if (searchQuery.availability.dayOfWeek && searchQuery.availability.dayOfWeek.length > 0) {
        conditions.push(`EXTRACT(DOW FROM s.scheduled_at) = ANY($${paramCount})`);
        values.push(searchQuery.availability.dayOfWeek);
        paramCount++;
      }
      
      if (searchQuery.availability.timeRange) {
        conditions.push(`
          EXTRACT(HOUR FROM s.scheduled_at) * 60 + EXTRACT(MINUTE FROM s.scheduled_at) 
          BETWEEN $${paramCount} AND $${paramCount + 1}
        `);
        const [startHour, startMin] = searchQuery.availability.timeRange.start.split(':').map(Number);
        const [endHour, endMin] = searchQuery.availability.timeRange.end.split(':').map(Number);
        values.push(startHour * 60 + startMin, endHour * 60 + endMin);
        paramCount += 2;
      }
    }

    // Price range (if hourly rate is available)
    if (searchQuery.priceRange) {
      if (searchQuery.priceRange.min) {
        conditions.push(`mp.hourly_rate >= $${paramCount}`);
        values.push(searchQuery.priceRange.min);
        paramCount++;
      }
      
      if (searchQuery.priceRange.max) {
        conditions.push(`mp.hourly_rate <= $${paramCount}`);
        values.push(searchQuery.priceRange.max);
        paramCount++;
      }
    }

    // Mentor experience
    if (searchQuery.mentorExperience) {
      if (searchQuery.mentorExperience.min) {
        conditions.push(`mp.years_of_experience >= $${paramCount}`);
        values.push(searchQuery.mentorExperience.min);
        paramCount++;
      }
      
      if (searchQuery.mentorExperience.max) {
        conditions.push(`mp.years_of_experience <= $${paramCount}`);
        values.push(searchQuery.mentorExperience.max);
        paramCount++;
      }
    }

    // Add conditions to query
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    // Sorting
    const sortBy = searchQuery.sortBy || 'relevance';
    const sortOrder = searchQuery.sortOrder || 'desc';
    
    switch (sortBy) {
      case 'rating':
        query += ` ORDER BY mp.rating ${sortOrder}, s.scheduled_at ASC`;
        break;
      case 'price':
        query += ` ORDER BY mp.hourly_rate ${sortOrder}, s.scheduled_at ASC`;
        break;
      case 'date':
        query += ` ORDER BY s.scheduled_at ${sortOrder}`;
        break;
      case 'experience':
        query += ` ORDER BY mp.years_of_experience ${sortOrder}, s.scheduled_at ASC`;
        break;
      default: // relevance
        if (searchQuery.query) {
          query += ` ORDER BY 
            CASE 
              WHEN s.title ILIKE $${paramCount} THEN 3
              WHEN s.description ILIKE $${paramCount} THEN 2
              WHEN mp.first_name ILIKE $${paramCount} OR mp.last_name ILIKE $${paramCount} THEN 1
              ELSE 0
            END DESC, 
            mp.rating DESC, 
            s.scheduled_at ASC`;
          values.push(`%${searchQuery.query}%`);
          paramCount++;
        } else {
          query += ` ORDER BY mp.rating DESC, s.scheduled_at ASC`;
        }
    }

    // Pagination
    const limit = searchQuery.limit || 20;
    const offset = searchQuery.offset || 0;
    
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    return { query, values };
  }

  private buildMentorSearchQuery(searchQuery: SearchQuery): { query: string; values: any[] } {
    let query = `
      SELECT 
        mp.user_id as id, mp.first_name, mp.last_name, mp.bio, mp.expertise_areas,
        mp.rating, mp.total_sessions, mp.years_of_experience, mp.hourly_rate,
        COUNT(s.id) as available_sessions
      FROM mentor_profiles mp
      LEFT JOIN sessions s ON mp.user_id = s.mentor_id 
        AND s.status = 'SCHEDULED' 
        AND s.scheduled_at > NOW()
        AND s.current_registrations < s.capacity
      WHERE 1=1
    `;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Text search
    if (searchQuery.query) {
      conditions.push(`(
        mp.first_name ILIKE $${paramCount} OR 
        mp.last_name ILIKE $${paramCount} OR 
        mp.bio ILIKE $${paramCount}
      )`);
      values.push(`%${searchQuery.query}%`);
      paramCount++;
    }

    // Expertise areas
    if (searchQuery.expertiseAreas && searchQuery.expertiseAreas.length > 0) {
      conditions.push(`mp.expertise_areas::jsonb ?| $${paramCount}`);
      values.push(searchQuery.expertiseAreas);
      paramCount++;
    }

    // Mentor rating
    if (searchQuery.mentorRating) {
      conditions.push(`mp.rating >= $${paramCount}`);
      values.push(searchQuery.mentorRating);
      paramCount++;
    }

    // Price range
    if (searchQuery.priceRange) {
      if (searchQuery.priceRange.min) {
        conditions.push(`mp.hourly_rate >= $${paramCount}`);
        values.push(searchQuery.priceRange.min);
        paramCount++;
      }
      
      if (searchQuery.priceRange.max) {
        conditions.push(`mp.hourly_rate <= $${paramCount}`);
        values.push(searchQuery.priceRange.max);
        paramCount++;
      }
    }

    // Mentor experience
    if (searchQuery.mentorExperience) {
      if (searchQuery.mentorExperience.min) {
        conditions.push(`mp.years_of_experience >= $${paramCount}`);
        values.push(searchQuery.mentorExperience.min);
        paramCount++;
      }
      
      if (searchQuery.mentorExperience.max) {
        conditions.push(`mp.years_of_experience <= $${paramCount}`);
        values.push(searchQuery.mentorExperience.max);
        paramCount++;
      }
    }

    // Add conditions to query
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    // Group by for the COUNT
    query += ` GROUP BY mp.user_id, mp.first_name, mp.last_name, mp.bio, mp.expertise_areas, 
               mp.rating, mp.total_sessions, mp.years_of_experience, mp.hourly_rate`;

    // Sorting
    const sortBy = searchQuery.sortBy || 'relevance';
    const sortOrder = searchQuery.sortOrder || 'desc';
    
    switch (sortBy) {
      case 'rating':
        query += ` ORDER BY mp.rating ${sortOrder}`;
        break;
      case 'price':
        query += ` ORDER BY mp.hourly_rate ${sortOrder}`;
        break;
      case 'experience':
        query += ` ORDER BY mp.years_of_experience ${sortOrder}`;
        break;
      default: // relevance
        query += ` ORDER BY mp.rating DESC, mp.total_sessions DESC`;
    }

    // Pagination
    const limit = searchQuery.limit || 20;
    const offset = searchQuery.offset || 0;
    
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    return { query, values };
  }

  private mapSessionSearchResult(row: any, searchQuery: SearchQuery): SearchResultSession {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      expertiseAreas: JSON.parse(row.expertise_areas || '[]'),
      sessionType: row.session_type,
      scheduledAt: row.scheduled_at,
      duration: row.duration,
      capacity: row.capacity,
      currentRegistrations: row.current_registrations,
      mentor: {
        id: row.mentor_id,
        name: `${row.first_name} ${row.last_name}`,
        rating: row.rating || 0,
        totalSessions: row.total_sessions || 0
      },
      relevanceScore: this.calculateRelevanceScore(row, searchQuery)
    };
  }

  private mapMentorSearchResult(row: any, searchQuery: SearchQuery): SearchResultMentor {
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      bio: row.bio,
      expertiseAreas: JSON.parse(row.expertise_areas || '[]'),
      rating: row.rating || 0,
      totalSessions: row.total_sessions || 0,
      yearsOfExperience: row.years_of_experience || 0,
      hourlyRate: row.hourly_rate,
      availableSessions: parseInt(row.available_sessions) || 0,
      relevanceScore: this.calculateRelevanceScore(row, searchQuery)
    };
  }

  private calculateRelevanceScore(row: any, searchQuery: SearchQuery): number {
    let score = 0;

    // Text relevance
    if (searchQuery.query) {
      const query = searchQuery.query.toLowerCase();
      const title = (row.title || '').toLowerCase();
      const description = (row.description || '').toLowerCase();
      const name = `${row.first_name || ''} ${row.last_name || ''}`.toLowerCase();
      
      if (title.includes(query)) score += 3;
      if (description.includes(query)) score += 2;
      if (name.includes(query)) score += 1;
    }

    // Rating boost
    if (row.rating) {
      score += row.rating;
    }

    // Experience boost
    if (row.total_sessions) {
      score += Math.min(row.total_sessions / 10, 2); // Up to 2 points for experience
    }

    return Math.max(score, 1); // Minimum score of 1
  }

  private async getSessionSearchFacets(client: any): Promise<SearchFacets> {
    // This is a simplified version - in production you'd want more sophisticated facet calculation
    const expertiseResult = await client.query(`
      SELECT jsonb_array_elements_text(s.expertise_areas) as expertise, COUNT(*) as count
      FROM sessions s
      JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      WHERE s.status = 'SCHEDULED' AND s.scheduled_at > NOW()
      GROUP BY expertise
      ORDER BY count DESC
      LIMIT 10
    `);

    const sessionTypeResult = await client.query(`
      SELECT s.session_type, COUNT(*) as count
      FROM sessions s
      WHERE s.status = 'SCHEDULED' AND s.scheduled_at > NOW()
      GROUP BY s.session_type
    `);

    return {
      expertiseAreas: expertiseResult.rows.reduce((acc: any, row: any) => {
        acc[row.expertise] = parseInt(row.count);
        return acc;
      }, {}),
      sessionTypes: sessionTypeResult.rows.reduce((acc: any, row: any) => {
        acc[row.session_type] = parseInt(row.count);
        return acc;
      }, {}),
      ratingRanges: {}, // Simplified - would calculate rating ranges
      priceRanges: {}, // Simplified - would calculate price ranges
      experienceRanges: {} // Simplified - would calculate experience ranges
    };
  }

  private async getMentorSearchFacets(client: any): Promise<SearchFacets> {
    // Similar to session facets but for mentors
    const expertiseResult = await client.query(`
      SELECT jsonb_array_elements_text(mp.expertise_areas) as expertise, COUNT(*) as count
      FROM mentor_profiles mp
      GROUP BY expertise
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      expertiseAreas: expertiseResult.rows.reduce((acc: any, row: any) => {
        acc[row.expertise] = parseInt(row.count);
        return acc;
      }, {}),
      sessionTypes: {},
      ratingRanges: {},
      priceRanges: {},
      experienceRanges: {}
    };
  }
}