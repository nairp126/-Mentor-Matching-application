import { Router, Request, Response } from 'express';
import { SearchService } from '../services/searchService';
import { AuthUtils } from '@mentor-platform/shared';
import Joi from 'joi';

const router = Router();
const searchService = new SearchService();
const authMiddleware = AuthUtils.createAuthMiddleware();

// Validation schema for search queries
const searchQuerySchema = Joi.object({
  query: Joi.string().min(1).max(100).optional(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).max(10).optional(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').optional(),
  mentorRating: Joi.number().min(0).max(5).optional(),
  availability: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    dayOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).optional(),
    timeRange: Joi.object({
      start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
    }).optional()
  }).optional(),
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    radius: Joi.number().min(1).max(1000).optional()
  }).optional(),
  priceRange: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional()
  }).optional(),
  mentorExperience: Joi.object({
    min: Joi.number().integer().min(0).optional(),
    max: Joi.number().integer().min(0).optional()
  }).optional(),
  sortBy: Joi.string().valid('relevance', 'rating', 'price', 'date', 'experience').default('relevance'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// Search sessions
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate search query
    const { error, value } = searchQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const searchResult = await searchService.searchSessions(value);
    
    res.json({
      ...searchResult,
      query: value,
      searchType: 'sessions',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Session search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search mentors
router.get('/mentors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate search query
    const { error, value } = searchQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const searchResult = await searchService.searchMentors(value);
    
    res.json({
      ...searchResult,
      query: value,
      searchType: 'mentors',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Mentor search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Combined search (sessions and mentors)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate search query
    const { error, value } = searchQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    // Perform both searches in parallel
    const [sessionResults, mentorResults] = await Promise.all([
      searchService.searchSessions({ ...value, limit: Math.ceil(value.limit / 2) }),
      searchService.searchMentors({ ...value, limit: Math.ceil(value.limit / 2) })
    ]);

    // Combine results
    const combinedResult = {
      sessions: sessionResults.sessions,
      mentors: mentorResults.mentors,
      total: sessionResults.total + mentorResults.total,
      facets: {
        ...sessionResults.facets,
        // Merge mentor facets
        expertiseAreas: {
          ...sessionResults.facets.expertiseAreas,
          ...mentorResults.facets.expertiseAreas
        }
      },
      breakdown: {
        sessions: {
          total: sessionResults.total,
          returned: sessionResults.sessions.length
        },
        mentors: {
          total: mentorResults.total,
          returned: mentorResults.mentors.length
        }
      }
    };
    
    res.json({
      ...combinedResult,
      query: value,
      searchType: 'combined',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Combined search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get search suggestions/autocomplete
router.get('/suggestions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query = req.query.q as string;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters long' });
    }

    // This is a simplified implementation
    // In production, you might want to use a dedicated search engine like Elasticsearch
    // or implement a more sophisticated suggestion system
    
    const suggestions = {
      expertiseAreas: [
        'JavaScript', 'Python', 'React', 'Node.js', 'Machine Learning',
        'Data Science', 'Web Development', 'Mobile Development', 'DevOps'
      ].filter(area => area.toLowerCase().includes(query.toLowerCase())),
      
      sessionTypes: [
        'ONE_ON_ONE', 'GROUP', 'WORKSHOP'
      ].filter(type => type.toLowerCase().includes(query.toLowerCase())),
      
      mentors: [], // Would query mentor names from database
      sessions: [] // Would query session titles from database
    };
    
    res.json({
      query,
      suggestions,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get popular searches
router.get('/popular', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // This would typically come from analytics/tracking data
    const popularSearches = {
      expertiseAreas: [
        { term: 'JavaScript', count: 150 },
        { term: 'Python', count: 120 },
        { term: 'React', count: 100 },
        { term: 'Machine Learning', count: 80 },
        { term: 'Data Science', count: 75 }
      ],
      queries: [
        { term: 'web development', count: 200 },
        { term: 'python tutorial', count: 150 },
        { term: 'react hooks', count: 120 },
        { term: 'machine learning basics', count: 100 },
        { term: 'javascript fundamentals', count: 90 }
      ],
      sessionTypes: [
        { term: 'ONE_ON_ONE', count: 300 },
        { term: 'GROUP', count: 150 },
        { term: 'WORKSHOP', count: 100 }
      ]
    };
    
    res.json({
      popularSearches,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Popular searches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as searchRoutes };