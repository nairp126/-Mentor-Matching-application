import { Router, Request, Response } from 'express';
import { MatchingService } from '../services/matchingService';
import { AuthUtils } from '@mentor-platform/shared';
import Joi from 'joi';

const router = Router();
const matchingService = new MatchingService();
const authMiddleware = AuthUtils.createAuthMiddleware();

// Validation schemas
const feedbackSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  attended: Joi.boolean().required(),
  helpful: Joi.boolean().required(),
  matchQuality: Joi.number().integer().min(1).max(5).required(),
  feedback: Joi.string().max(1000).optional()
});

// Get personalized session recommendations
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students can get recommendations' });
    }

    const limit = parseInt(req.query.limit as string) || 10;
    
    if (limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'Limit must be between 1 and 50' });
    }

    const recommendations = await matchingService.getRecommendations(userId, limit);
    
    res.json({
      recommendations,
      total: recommendations.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Recommendations error:', error);
    
    if (error.message === 'Student profile not found') {
      return res.status(404).json({ error: 'Student profile not found. Please complete your profile first.' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record feedback for a session recommendation
router.post('/:sessionId/feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students can provide feedback' });
    }

    // Validate feedback data
    const { error, value } = feedbackSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    await matchingService.recordFeedback(userId, sessionId, value);
    
    res.status(201).json({ 
      message: 'Feedback recorded successfully',
      sessionId,
      feedback: value
    });
  } catch (error: any) {
    console.error('Feedback recording error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recommendation explanation (for debugging/transparency)
router.get('/:sessionId/explanation', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students can view recommendation explanations' });
    }

    // Get a single recommendation for this session to show the explanation
    const recommendations = await matchingService.getRecommendations(userId, 100);
    const recommendation = recommendations.find(r => r.session.id === sessionId);
    
    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found for this session' });
    }

    res.json({
      sessionId,
      compatibilityScore: recommendation.compatibilityScore,
      reasons: recommendation.reasons,
      explanation: {
        message: 'This recommendation was generated based on your profile, preferences, and session history.',
        factors: [
          'Expertise alignment with your interests',
          'Learning goals compatibility',
          'Session type preferences',
          'Mentor rating and experience',
          'Historical session patterns',
          'Time preferences'
        ]
      }
    });
  } catch (error: any) {
    console.error('Recommendation explanation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as recommendationRoutes };