import { Router, Request, Response } from 'express';
import { SessionService } from '../services/sessionService';
import { 
  validateSessionCreate, 
  validateSessionUpdate, 
  validateSessionFilters 
} from '../validation/sessionValidation';
import { AuthUtils } from '@mentor-platform/shared';

const router = Router();
const sessionService = new SessionService();

// Create session (mentors only)
router.post('/', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can create sessions' });
    }

    // Validate session data
    const { error, value } = validateSessionCreate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const session = await sessionService.createSession(userId, value);
    res.status(201).json(session);
  } catch (error: any) {
    console.error('Session creation error:', error);
    
    if (error.message.includes('Scheduling conflict')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get session by ID
router.get('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const session = await sessionService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if user has permission to view this session
    // Mentors can view their own sessions, students can view sessions they're registered for or available sessions
    const isOwner = session.mentorId === userId;
    const isRegistered = session.registeredStudents.some((reg: any) => reg.studentId === userId);
    const isAvailable = session.status === 'SCHEDULED' && session.currentRegistrations < session.capacity;
    
    if (!isOwner && !isRegistered && !isAvailable) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Filter sensitive information for non-owners
    if (!isOwner) {
      // Remove detailed registration info for non-owners
      session.registeredStudents = session.registeredStudents.map((reg: any) => ({
        ...reg,
        notes: undefined
      }));
      
      // Remove waitlist details for non-owners
      session.waitlist = session.waitlist.map((entry: any) => ({
        ...entry,
        studentId: entry.studentId === userId ? entry.studentId : 'hidden'
      }));
    }

    res.json(session);
  } catch (error: any) {
    console.error('Session retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update session (mentor only, own sessions)
router.put('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can update sessions' });
    }

    // Check if session exists and belongs to the mentor
    const existingSession = await sessionService.getSession(sessionId);
    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existingSession.mentorId !== userId) {
      return res.status(403).json({ error: 'Can only update own sessions' });
    }

    // Validate update data
    const { error, value } = validateSessionUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const updatedSession = await sessionService.updateSession(sessionId, value);
    res.json(updatedSession);
  } catch (error: any) {
    console.error('Session update error:', error);
    
    if (error.message.includes('Scheduling conflict')) {
      return res.status(409).json({ error: error.message });
    }
    
    if (error.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete session (mentor only, own sessions)
router.delete('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can delete sessions' });
    }

    // Check if session exists and belongs to the mentor
    const existingSession = await sessionService.getSession(sessionId);
    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existingSession.mentorId !== userId) {
      return res.status(403).json({ error: 'Can only delete own sessions' });
    }

    await sessionService.deleteSession(sessionId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Session deletion error:', error);
    
    if (error.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available sessions (public, with filters)
router.get('/', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate filters
    const { error, value } = validateSessionFilters(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const sessions = await sessionService.getAvailableSessions(value);
    
    // Filter out sensitive information for public view
    const publicSessions = sessions.map((session: any) => ({
      ...session,
      registeredStudents: [], // Don't show registration details in public view
      waitlist: [], // Don't show waitlist in public view
      materials: [] // Don't show materials in public view
    }));
    
    res.json({
      sessions: publicSessions,
      total: publicSessions.length,
      limit: value.limit,
      offset: value.offset
    });
  } catch (error: any) {
    console.error('Sessions retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get mentor's sessions
router.get('/mentor/:mentorId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { mentorId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Users can only view their own mentor sessions with full details
    const isOwner = mentorId === userId;
    
    // Validate filters
    const { error, value } = validateSessionFilters(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const sessions = await sessionService.getMentorSessions(mentorId, value);
    
    // Filter sensitive information for non-owners
    const filteredSessions = isOwner ? sessions : sessions.map((session: any) => ({
      ...session,
      registeredStudents: [],
      waitlist: [],
      materials: []
    }));
    
    res.json({
      sessions: filteredSessions,
      total: filteredSessions.length,
      limit: value.limit,
      offset: value.offset
    });
  } catch (error: any) {
    console.error('Mentor sessions retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get student's registered sessions
router.get('/student/:studentId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Users can only view their own registered sessions
    if (studentId !== userId) {
      return res.status(403).json({ error: 'Can only view own registered sessions' });
    }

    // Validate filters
    const { error, value } = validateSessionFilters(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    const sessions = await sessionService.getStudentSessions(studentId, value);
    
    res.json({
      sessions,
      total: sessions.length,
      limit: value.limit,
      offset: value.offset
    });
  } catch (error: any) {
    console.error('Student sessions retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as sessionRoutes };