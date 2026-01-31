import { Pool } from 'pg';
import Redis from 'ioredis';

export interface RatingTrend {
  period: string;
  averageRating: number;
  totalReviews: number;
  ratingChange: number;
}

export interface DetailedRatingStats {
  overall: {
    averageRating: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;
    percentileRatings: {
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
  };
  trends: {
    last30Days: RatingTrend[];
    last12Months: RatingTrend[];
  };
  categories: {
    byExpertiseArea: Record<string, {
      averageRating: number;
      totalReviews: number;
    }>;
    bySessionType: Record<string, {
      averageRating: number;
      totalReviews: number;
    }>;
  };
  sentiment: {
    positivePercentage: number;
    neutralPercentage: number;
    negativePercentage: number;
    commonPositiveTags: string[];
    commonNegativeTags: string[];
  };
  comparison: {
    platformAverage: number;
    percentileRank: number;
    betterThanPercentage: number;
  };
}

export interface RatingInsights {
  strengths: string[];
  improvementAreas: string[];
  recommendations: string[];
  ratingGoals: {
    targetRating: number;
    reviewsNeeded: number;
    timeEstimate: string;
  };
}

export class RatingAnalyticsService {
  private db: Pool;
  private redis: Redis;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get detailed rating statistics with analytics
   */
  async getDetailedRatingStats(userId: string): Promise<DetailedRatingStats> {
    const cacheKey = `detailed_rating_stats:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const [overall, trends, categories, sentiment, comparison] = await Promise.all([
      this.calculateOverallStats(userId),
      this.calculateRatingTrends(userId),
      this.calculateCategoryStats(userId),
      this.calculateSentimentAnalysis(userId),
      this.calculatePlatformComparison(userId)
    ]);

    const stats: DetailedRatingStats = {
      overall,
      trends,
      categories,
      sentiment,
      comparison
    };

    // Cache for 2 hours
    await this.redis.setex(cacheKey, 7200, JSON.stringify(stats));
    
    return stats;
  }

  /**
   * Generate rating insights and recommendations
   */
  async generateRatingInsights(userId: string): Promise<RatingInsights> {
    const stats = await this.getDetailedRatingStats(userId);
    
    const strengths = this.identifyStrengths(stats);
    const improvementAreas = this.identifyImprovementAreas(stats);
    const recommendations = this.generateRecommendations(stats);
    const ratingGoals = this.calculateRatingGoals(stats);

    return {
      strengths,
      improvementAreas,
      recommendations,
      ratingGoals
    };
  }

  /**
   * Calculate rating velocity (ratings per time period)
   */
  async calculateRatingVelocity(userId: string): Promise<{
    daily: number;
    weekly: number;
    monthly: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }> {
    const query = `
      SELECT 
        DATE_TRUNC('day', created_at) as day,
        COUNT(*) as daily_count
      FROM reviews
      WHERE reviewee_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `;

    const result = await this.db.query(query, [userId]);
    const dailyData = result.rows;

    if (dailyData.length === 0) {
      return { daily: 0, weekly: 0, monthly: 0, trend: 'stable' };
    }

    const totalReviews = dailyData.reduce((sum, row) => sum + parseInt(row.daily_count), 0);
    const daysWithData = dailyData.length;
    
    const daily = totalReviews / 30; // Average over 30 days
    const weekly = daily * 7;
    const monthly = daily * 30;

    // Calculate trend
    const firstHalf = dailyData.slice(0, Math.floor(daysWithData / 2));
    const secondHalf = dailyData.slice(Math.floor(daysWithData / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, row) => sum + parseInt(row.daily_count), 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, row) => sum + parseInt(row.daily_count), 0) / secondHalf.length;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    const changeThreshold = 0.2; // 20% change threshold
    
    if (secondHalfAvg > firstHalfAvg * (1 + changeThreshold)) {
      trend = 'increasing';
    } else if (secondHalfAvg < firstHalfAvg * (1 - changeThreshold)) {
      trend = 'decreasing';
    }

    return { daily, weekly, monthly, trend };
  }

  /**
   * Get rating leaderboard position
   */
  async getRatingLeaderboardPosition(userId: string): Promise<{
    rank: number;
    totalMentors: number;
    percentile: number;
    nearbyMentors: Array<{
      rank: number;
      userId: string;
      rating: number;
      totalReviews: number;
    }>;
  }> {
    const query = `
      WITH mentor_ratings AS (
        SELECT 
          mp.user_id,
          mp.rating,
          mp.total_sessions,
          ROW_NUMBER() OVER (ORDER BY mp.rating DESC, mp.total_sessions DESC) as rank
        FROM mentor_profiles mp
        WHERE mp.rating > 0
      )
      SELECT 
        mr.*,
        (SELECT COUNT(*) FROM mentor_ratings) as total_mentors
      FROM mentor_ratings mr
      WHERE mr.user_id = $1
    `;

    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return { rank: 0, totalMentors: 0, percentile: 0, nearbyMentors: [] };
    }

    const userRank = parseInt(result.rows[0].rank);
    const totalMentors = parseInt(result.rows[0].total_mentors);
    const percentile = ((totalMentors - userRank + 1) / totalMentors) * 100;

    // Get nearby mentors (5 above and 5 below)
    const nearbyQuery = `
      WITH mentor_ratings AS (
        SELECT 
          mp.user_id,
          mp.rating,
          mp.total_sessions,
          ROW_NUMBER() OVER (ORDER BY mp.rating DESC, mp.total_sessions DESC) as rank
        FROM mentor_profiles mp
        WHERE mp.rating > 0
      )
      SELECT *
      FROM mentor_ratings
      WHERE rank BETWEEN $1 AND $2
      ORDER BY rank
    `;

    const nearbyResult = await this.db.query(nearbyQuery, [
      Math.max(1, userRank - 5),
      userRank + 5
    ]);

    const nearbyMentors = nearbyResult.rows.map(row => ({
      rank: parseInt(row.rank),
      userId: row.user_id,
      rating: parseFloat(row.rating),
      totalReviews: parseInt(row.total_sessions)
    }));

    return {
      rank: userRank,
      totalMentors,
      percentile: Math.round(percentile * 100) / 100,
      nearbyMentors
    };
  }

  /**
   * Calculate rating impact on session bookings
   */
  async calculateRatingImpact(userId: string): Promise<{
    bookingRate: number;
    ratingCorrelation: number;
    projectedBookings: {
      current: number;
      ifRatingImproved: Record<string, number>; // rating -> projected bookings
    };
  }> {
    // Get booking data and rating history
    const bookingQuery = `
      SELECT 
        DATE_TRUNC('month', s.created_at) as month,
        COUNT(*) as bookings,
        AVG(mp.rating) as avg_rating_at_time
      FROM sessions s
      JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      WHERE s.mentor_id = $1
        AND s.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', s.created_at)
      ORDER BY month
    `;

    const result = await this.db.query(bookingQuery, [userId]);
    const monthlyData = result.rows;

    if (monthlyData.length < 3) {
      return {
        bookingRate: 0,
        ratingCorrelation: 0,
        projectedBookings: { current: 0, ifRatingImproved: {} }
      };
    }

    // Calculate correlation between rating and bookings
    const ratings = monthlyData.map(row => parseFloat(row.avg_rating_at_time));
    const bookings = monthlyData.map(row => parseInt(row.bookings));
    
    const ratingCorrelation = this.calculateCorrelation(ratings, bookings);
    const currentBookingRate = bookings.reduce((sum, b) => sum + b, 0) / bookings.length;

    // Project bookings at different rating levels
    const currentRating = ratings[ratings.length - 1] || 0;
    const projectedBookings: Record<string, number> = {};
    
    for (let targetRating = Math.ceil(currentRating * 10) / 10; targetRating <= 5.0; targetRating += 0.1) {
      const ratingImprovement = targetRating - currentRating;
      const projectedIncrease = ratingImprovement * ratingCorrelation * currentBookingRate;
      projectedBookings[targetRating.toFixed(1)] = Math.max(0, currentBookingRate + projectedIncrease);
    }

    return {
      bookingRate: currentBookingRate,
      ratingCorrelation,
      projectedBookings: {
        current: currentBookingRate,
        ifRatingImproved: projectedBookings
      }
    };
  }

  /**
   * Calculate overall rating statistics
   */
  private async calculateOverallStats(userId: string) {
    const query = `
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total_reviews,
        rating,
        COUNT(*) as rating_count,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY rating) as p25,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY rating) as p75,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY rating) as p90
      FROM reviews
      WHERE reviewee_id = $1
      GROUP BY rating
      ORDER BY rating
    `;

    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        percentileRatings: { p25: 0, p50: 0, p75: 0, p90: 0 }
      };
    }

    const averageRating = parseFloat(result.rows[0].average_rating) || 0;
    const percentileRatings = {
      p25: parseFloat(result.rows[0].p25) || 0,
      p50: parseFloat(result.rows[0].p50) || 0,
      p75: parseFloat(result.rows[0].p75) || 0,
      p90: parseFloat(result.rows[0].p90) || 0
    };

    let totalReviews = 0;
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const row of result.rows) {
      const rating = parseInt(row.rating);
      const count = parseInt(row.rating_count);
      ratingDistribution[rating] = count;
      totalReviews += count;
    }

    return {
      averageRating: Math.round(averageRating * 100) / 100,
      totalReviews,
      ratingDistribution,
      percentileRatings
    };
  }

  /**
   * Calculate rating trends over time
   */
  private async calculateRatingTrends(userId: string) {
    const last30DaysQuery = `
      SELECT 
        DATE_TRUNC('day', created_at) as period,
        AVG(rating) as average_rating,
        COUNT(*) as total_reviews
      FROM reviews
      WHERE reviewee_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY period
    `;

    const last12MonthsQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as period,
        AVG(rating) as average_rating,
        COUNT(*) as total_reviews
      FROM reviews
      WHERE reviewee_id = $1
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY period
    `;

    const [dailyResult, monthlyResult] = await Promise.all([
      this.db.query(last30DaysQuery, [userId]),
      this.db.query(last12MonthsQuery, [userId])
    ]);

    const processTrendData = (rows: any[]): RatingTrend[] => {
      return rows.map((row, index) => {
        const currentRating = parseFloat(row.average_rating);
        const previousRating = index > 0 ? parseFloat(rows[index - 1].average_rating) : currentRating;
        
        return {
          period: row.period.toISOString(),
          averageRating: Math.round(currentRating * 100) / 100,
          totalReviews: parseInt(row.total_reviews),
          ratingChange: Math.round((currentRating - previousRating) * 100) / 100
        };
      });
    };

    return {
      last30Days: processTrendData(dailyResult.rows),
      last12Months: processTrendData(monthlyResult.rows)
    };
  }

  /**
   * Calculate category-based statistics
   */
  private async calculateCategoryStats(userId: string) {
    const expertiseQuery = `
      SELECT 
        unnest(s.expertise_areas) as expertise_area,
        AVG(r.rating) as average_rating,
        COUNT(*) as total_reviews
      FROM reviews r
      JOIN sessions s ON r.session_id = s.id
      WHERE r.reviewee_id = $1
      GROUP BY expertise_area
      ORDER BY total_reviews DESC
    `;

    const sessionTypeQuery = `
      SELECT 
        s.session_type,
        AVG(r.rating) as average_rating,
        COUNT(*) as total_reviews
      FROM reviews r
      JOIN sessions s ON r.session_id = s.id
      WHERE r.reviewee_id = $1
      GROUP BY s.session_type
      ORDER BY total_reviews DESC
    `;

    const [expertiseResult, sessionTypeResult] = await Promise.all([
      this.db.query(expertiseQuery, [userId]),
      this.db.query(sessionTypeQuery, [userId])
    ]);

    const byExpertiseArea: Record<string, { averageRating: number; totalReviews: number }> = {};
    for (const row of expertiseResult.rows) {
      byExpertiseArea[row.expertise_area] = {
        averageRating: Math.round(parseFloat(row.average_rating) * 100) / 100,
        totalReviews: parseInt(row.total_reviews)
      };
    }

    const bySessionType: Record<string, { averageRating: number; totalReviews: number }> = {};
    for (const row of sessionTypeResult.rows) {
      bySessionType[row.session_type] = {
        averageRating: Math.round(parseFloat(row.average_rating) * 100) / 100,
        totalReviews: parseInt(row.total_reviews)
      };
    }

    return { byExpertiseArea, bySessionType };
  }

  /**
   * Calculate sentiment analysis from reviews
   */
  private async calculateSentimentAnalysis(userId: string) {
    const query = `
      SELECT 
        rating,
        tags,
        comment
      FROM reviews
      WHERE reviewee_id = $1
        AND created_at >= NOW() - INTERVAL '6 months'
    `;

    const result = await this.db.query(query, [userId]);
    const reviews = result.rows;

    if (reviews.length === 0) {
      return {
        positivePercentage: 0,
        neutralPercentage: 0,
        negativePercentage: 0,
        commonPositiveTags: [],
        commonNegativeTags: []
      };
    }

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    const allTags: string[] = [];

    for (const review of reviews) {
      const rating = parseInt(review.rating);
      
      if (rating >= 4) positive++;
      else if (rating === 3) neutral++;
      else negative++;

      if (review.tags) {
        const tags = JSON.parse(review.tags);
        allTags.push(...tags);
      }
    }

    const total = reviews.length;
    const positivePercentage = Math.round((positive / total) * 100);
    const neutralPercentage = Math.round((neutral / total) * 100);
    const negativePercentage = Math.round((negative / total) * 100);

    // Count tag frequency
    const tagCounts: Record<string, number> = {};
    for (const tag of allTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    // Get most common tags (simplified - in reality you'd categorize positive/negative)
    const sortedTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    return {
      positivePercentage,
      neutralPercentage,
      negativePercentage,
      commonPositiveTags: sortedTags.slice(0, 5),
      commonNegativeTags: sortedTags.slice(5, 10)
    };
  }

  /**
   * Calculate platform comparison statistics
   */
  private async calculatePlatformComparison(userId: string) {
    const query = `
      WITH user_rating AS (
        SELECT AVG(rating) as user_avg
        FROM reviews
        WHERE reviewee_id = $1
      ),
      platform_stats AS (
        SELECT 
          AVG(rating) as platform_avg,
          COUNT(DISTINCT reviewee_id) as total_mentors
        FROM reviews r
        JOIN mentor_profiles mp ON r.reviewee_id = mp.user_id
      ),
      better_mentors AS (
        SELECT COUNT(DISTINCT reviewee_id) as count
        FROM reviews r
        JOIN mentor_profiles mp ON r.reviewee_id = mp.user_id
        WHERE mp.rating > (SELECT user_avg FROM user_rating)
      )
      SELECT 
        ur.user_avg,
        ps.platform_avg,
        ps.total_mentors,
        bm.count as better_mentors_count
      FROM user_rating ur, platform_stats ps, better_mentors bm
    `;

    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return { platformAverage: 0, percentileRank: 0, betterThanPercentage: 0 };
    }

    const row = result.rows[0];
    const userAvg = parseFloat(row.user_avg) || 0;
    const platformAverage = parseFloat(row.platform_avg) || 0;
    const totalMentors = parseInt(row.total_mentors) || 1;
    const betterMentorsCount = parseInt(row.better_mentors_count) || 0;

    const betterThanCount = totalMentors - betterMentorsCount;
    const betterThanPercentage = Math.round((betterThanCount / totalMentors) * 100);
    const percentileRank = Math.round(((totalMentors - betterMentorsCount) / totalMentors) * 100);

    return {
      platformAverage: Math.round(platformAverage * 100) / 100,
      percentileRank,
      betterThanPercentage
    };
  }

  /**
   * Identify strengths based on rating data
   */
  private identifyStrengths(stats: DetailedRatingStats): string[] {
    const strengths: string[] = [];

    if (stats.overall.averageRating >= 4.5) {
      strengths.push('Consistently excellent ratings');
    }

    if (stats.comparison.percentileRank >= 80) {
      strengths.push('Top performer on the platform');
    }

    if (stats.sentiment.positivePercentage >= 80) {
      strengths.push('High student satisfaction');
    }

    // Find best expertise areas
    const bestAreas = Object.entries(stats.categories.byExpertiseArea)
      .filter(([, data]) => data.averageRating >= 4.5 && data.totalReviews >= 3)
      .map(([area]) => area);

    if (bestAreas.length > 0) {
      strengths.push(`Strong expertise in ${bestAreas.slice(0, 2).join(' and ')}`);
    }

    return strengths;
  }

  /**
   * Identify improvement areas
   */
  private identifyImprovementAreas(stats: DetailedRatingStats): string[] {
    const areas: string[] = [];

    if (stats.overall.averageRating < 4.0) {
      areas.push('Overall rating needs improvement');
    }

    if (stats.sentiment.negativePercentage > 20) {
      areas.push('Address common student concerns');
    }

    // Find weak expertise areas
    const weakAreas = Object.entries(stats.categories.byExpertiseArea)
      .filter(([, data]) => data.averageRating < 4.0 && data.totalReviews >= 3)
      .map(([area]) => area);

    if (weakAreas.length > 0) {
      areas.push(`Improve delivery in ${weakAreas.slice(0, 2).join(' and ')}`);
    }

    return areas;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(stats: DetailedRatingStats): string[] {
    const recommendations: string[] = [];

    if (stats.overall.totalReviews < 10) {
      recommendations.push('Focus on getting more reviews to build credibility');
    }

    if (stats.sentiment.positivePercentage < 70) {
      recommendations.push('Follow up with students after sessions to address concerns');
    }

    if (stats.comparison.percentileRank < 50) {
      recommendations.push('Study top-rated mentors in your expertise areas');
    }

    return recommendations;
  }

  /**
   * Calculate rating goals
   */
  private calculateRatingGoals(stats: DetailedRatingStats) {
    const currentRating = stats.overall.averageRating;
    const totalReviews = stats.overall.totalReviews;
    
    let targetRating = Math.min(5.0, currentRating + 0.5);
    if (currentRating >= 4.5) {
      targetRating = 5.0;
    }

    // Calculate reviews needed to reach target
    const currentSum = currentRating * totalReviews;
    const targetSum = targetRating * (totalReviews + 1);
    const reviewsNeeded = Math.max(1, Math.ceil((targetSum - currentSum) / (5 - targetRating)));

    // Estimate time based on current velocity
    const timeEstimate = reviewsNeeded <= 5 ? '1-2 weeks' : 
                        reviewsNeeded <= 15 ? '1-2 months' : 
                        '3+ months';

    return {
      targetRating: Math.round(targetRating * 100) / 100,
      reviewsNeeded,
      timeEstimate
    };
  }

  /**
   * Calculate correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
}