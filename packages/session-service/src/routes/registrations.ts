import { Router, Request, Response } from 'express';
import { RegistrationService } from '../services/registrationService';
import { validateRegistrationStatus } from '../validation/sessionValidation';
import { AuthUtils } from '@mentor-platform/shared';

const router = Router();
const registrationService = new RegistrationService();

// Register for a session
router.post('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students can register for sessions' });
    }

    const result = await registrationService.registerForSession(sessionId, userId);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel registration
router.delete('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students can cancel registrations' });
    }

    const result = await registrationService.cancelRegistration(sessionId, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Registration cancellation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get registration status for a session
router.get('/:sessionId/status', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const registration = await registrationService.getRegistration(sessionId, userId);
    const waitlistEntry = await registrationService.getWaitlistEntry(sessionId, userId);
    
    if (registration) {
      res.json({
        type: 'registration',
        status: registration.status,
        registeredAt: registration.registeredAt,
        notes: registration.notes
      });
    } else if (waitlistEntry) {
      res.json({
        type: 'waitlist',
        position: waitlistEntry.position,
        addedAt: waitlistEntry.addedAt,
        notified: waitlistEntry.notified
      });
    } else {
      res.json({
        type: 'none',
        message: 'Not registered or on waitlist'
      });
    }
  } catch (error: any) {
    console.error('Registration status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all registrations for a session (mentor only)
router.get('/:sessionId', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can view session registrations' });
    }

    // TODO: Verify that the mentor owns this session
    // This would require a call to the session service or a database query

    const registrations = await registrationService.getSessionRegistrations(sessionId);
    const waitlist = await registrationService.getSessionWaitlist(sessionId);
    
    res.json({
      registrations,
      waitlist,
      totalRegistrations: registrations.length,
      totalWaitlist: waitlist.length
    });
  } catch (error: any) {
    console.error('Session registrations retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update registration status (mentor only)
router.put('/registration/:registrationId/status', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { registrationId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can update registration status' });
    }

    // Validate status update data
    const { error, value } = validateRegistrationStatus(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    // TODO: Verify that the mentor owns the session for this registration
    // This would require a database query to check session ownership

    const updatedRegistration = await registrationService.updateRegistrationStatus(
      registrationId,
      value.status,
      value.notes
    );
    
    res.json(updatedRegistration);
  } catch (error: any) {
    console.error('Registration status update error:', error);
    
    if (error.message === 'Registration not found') {
      return res.status(404).json({ error: 'Registration not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get waitlist for a session (mentor only)
router.get('/:sessionId/waitlist', AuthUtils.createAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRole !== 'MENTOR') {
      return res.status(403).json({ error: 'Only mentors can view session waitlist' });
    }

    // TODO: Verify that the mentor owns this session

    const waitlist = await registrationService.getSessionWaitlist(sessionId);
    
    res.json({
      waitlist,
      total: waitlist.length
    });
  } catch (error: any) {
    console.error('Session waitlist retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as registrationRoutes };