import { Router, Request, Response } from 'express';
import { RecurringService } from '../services/recurringService';
import { 
  validateRecurringPattern, 
  validateRecurringPatternUpdate 
} from '../validation/sessionValidation';
import { AuthUtils } from '@mentor-platform/shared';

const router = Router();
const recurringService = new RecurringService();

// Create recurring pattern (mentors only)
router.post('/', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can create recurring patterns' });
    }

    // Validate pattern data
    const { error, value } = validateRecurringPattern(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const pattern = await recurringService.createRecurringPattern(userId, value);
    res.status(201).json(pattern);
  } catch (error: any) {
    console.error('Recurring pattern creation error:', error);
    
    if (error.message.includes('Day of week') || error.message.includes('Time of day') || 
        error.message.includes('End date') || error.message.includes('Max sessions')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recurring pattern by ID
router.get('/:patternId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const pattern = await recurringService.getRecurringPattern(patternId);
    
    if (!pattern) {
      return res.status(404).json({ error: 'Recurring pattern not found' });
    }

    // Only allow mentors to view their own patterns
    if (pattern.mentorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(pattern);
  } catch (error: any) {
    console.error('Recurring pattern retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update recurring pattern (mentor only, own patterns)
router.put('/:patternId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can update recurring patterns' });
    }

    // Check if pattern exists and belongs to the mentor
    const existingPattern = await recurringService.getRecurringPattern(patternId);
    if (!existingPattern) {
      return res.status(404).json({ error: 'Recurring pattern not found' });
    }

    if (existingPattern.mentorId !== userId) {
      return res.status(403).json({ error: 'Can only update own recurring patterns' });
    }

    // Validate update data
    const { error, value } = validateRecurringPatternUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const updatedPattern = await recurringService.updateRecurringPattern(patternId, value);
    res.json(updatedPattern);
  } catch (error: any) {
    console.error('Recurring pattern update error:', error);
    
    if (error.message === 'Pattern not found') {
      return res.status(404).json({ error: 'Recurring pattern not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate recurring pattern (mentor only, own patterns)
router.delete('/:patternId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can deactivate recurring patterns' });
    }

    // Check if pattern exists and belongs to the mentor
    const existingPattern = await recurringService.getRecurringPattern(patternId);
    if (!existingPattern) {
      return res.status(404).json({ error: 'Recurring pattern not found' });
    }

    if (existingPattern.mentorId !== userId) {
      return res.status(403).json({ error: 'Can only deactivate own recurring patterns' });
    }

    await recurringService.deactivateRecurringPattern(patternId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Recurring pattern deactivation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get mentor's recurring patterns
router.get('/mentor/:mentorId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { mentorId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Users can only view their own recurring patterns
    if (mentorId !== userId) {
      return res.status(403).json({ error: 'Can only view own recurring patterns' });
    }

    const patterns = await recurringService.getMentorRecurringPatterns(mentorId);
    
    res.json({
      patterns,
      total: patterns.length
    });
  } catch (error: any) {
    console.error('Mentor recurring patterns retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate sessions from pattern (mentor only, own patterns)
router.post('/:patternId/generate', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can generate sessions from patterns' });
    }

    // Check if pattern exists and belongs to the mentor
    const existingPattern = await recurringService.getRecurringPattern(patternId);
    if (!existingPattern) {
      return res.status(404).json({ error: 'Recurring pattern not found' });
    }

    if (existingPattern.mentorId !== userId) {
      return res.status(403).json({ error: 'Can only generate sessions from own patterns' });
    }

    // Get look-ahead days from query parameter (default 30)
    const lookAheadDays = parseInt(req.query.lookAheadDays as string) || 30;
    
    if (lookAheadDays < 1 || lookAheadDays > 365) {
      return res.status(400).json({ error: 'Look ahead days must be between 1 and 365' });
    }

    const sessionIds = await recurringService.generateSessionsFromPattern(patternId, lookAheadDays);
    
    res.json({
      message: `Generated ${sessionIds.length} sessions`,
      sessionIds,
      lookAheadDays
    });
  } catch (error: any) {
    console.error('Session generation error:', error);
    
    if (error.message === 'Pattern not found or inactive') {
      return res.status(404).json({ error: 'Recurring pattern not found or inactive' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as recurringRoutes };