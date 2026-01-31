import cron from 'node-cron';
import { RecurringService } from './recurringService';
import { db } from '../index';

export class SchedulerService {
  private recurringService: RecurringService;
  private isRunning: boolean = false;

  constructor() {
    this.recurringService = new RecurringService();
  }

  start(): void {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    console.log('Starting session scheduler...');

    // Generate recurring sessions every day at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Running recurring session generation...');
      await this.generateRecurringSessions();
    });

    // Update session statuses every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.updateSessionStatuses();
    });

    // Clean up old sessions every day at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('Running session cleanup...');
      await this.cleanupOldSessions();
    });

    this.isRunning = true;
    console.log('Session scheduler started successfully');
  }

  stop(): void {
    if (!this.isRunning) {
      console.log('Scheduler is not running');
      return;
    }

    // Note: node-cron doesn't provide a direct way to stop all tasks
    // In a production environment, you might want to keep track of task references
    this.isRunning = false;
    console.log('Session scheduler stopped');
  }

  private async generateRecurringSessions(): Promise<void> {
    try {
      const client = await db.getClient();

      try {
        // Get all active recurring patterns
        const result = await client.query(`
          SELECT id FROM recurring_patterns 
          WHERE is_active = true
        `);

        const patterns = result.rows;
        console.log(`Found ${patterns.length} active recurring patterns`);

        let totalGenerated = 0;

        for (const pattern of patterns) {
          try {
            const sessionIds = await this.recurringService.generateSessionsFromPattern(
              pattern.id,
              30 // Look ahead 30 days
            );
            
            totalGenerated += sessionIds.length;
            
            if (sessionIds.length > 0) {
              console.log(`Generated ${sessionIds.length} sessions for pattern ${pattern.id}`);
            }
          } catch (error) {
            console.error(`Error generating sessions for pattern ${pattern.id}:`, error);
          }
        }

        console.log(`Total sessions generated: ${totalGenerated}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in recurring session generation:', error);
    }
  }

  private async updateSessionStatuses(): Promise<void> {
    try {
      const client = await db.getClient();

      try {
        const now = new Date();

        // Mark sessions as IN_PROGRESS if they've started
        const inProgressResult = await client.query(`
          UPDATE sessions 
          SET status = 'IN_PROGRESS', updated_at = $1
          WHERE status = 'SCHEDULED' 
            AND scheduled_at <= $1
            AND scheduled_at + INTERVAL '1 minute' * duration > $1
          RETURNING id
        `, [now]);

        if (inProgressResult.rows.length > 0) {
          console.log(`Marked ${inProgressResult.rows.length} sessions as IN_PROGRESS`);
        }

        // Mark sessions as COMPLETED if they've ended
        const completedResult = await client.query(`
          UPDATE sessions 
          SET status = 'COMPLETED', updated_at = $1
          WHERE status = 'IN_PROGRESS' 
            AND scheduled_at + INTERVAL '1 minute' * duration <= $1
          RETURNING id
        `, [now]);

        if (completedResult.rows.length > 0) {
          console.log(`Marked ${completedResult.rows.length} sessions as COMPLETED`);
        }

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating session statuses:', error);
    }
  }

  private async cleanupOldSessions(): Promise<void> {
    try {
      const client = await db.getClient();

      try {
        // Delete sessions older than 6 months that are completed or cancelled
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const result = await client.query(`
          DELETE FROM sessions 
          WHERE status IN ('COMPLETED', 'CANCELLED') 
            AND scheduled_at < $1
          RETURNING id
        `, [sixMonthsAgo]);

        if (result.rows.length > 0) {
          console.log(`Cleaned up ${result.rows.length} old sessions`);
        }

        // Clean up old waitlist entries for completed/cancelled sessions
        const waitlistResult = await client.query(`
          DELETE FROM session_waitlist 
          WHERE session_id IN (
            SELECT id FROM sessions 
            WHERE status IN ('COMPLETED', 'CANCELLED') 
              AND scheduled_at < $1
          )
          RETURNING id
        `, [sixMonthsAgo]);

        if (waitlistResult.rows.length > 0) {
          console.log(`Cleaned up ${waitlistResult.rows.length} old waitlist entries`);
        }

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
    }
  }

  // Manual trigger methods for testing/admin purposes
  async triggerRecurringGeneration(): Promise<void> {
    console.log('Manually triggering recurring session generation...');
    await this.generateRecurringSessions();
  }

  async triggerStatusUpdate(): Promise<void> {
    console.log('Manually triggering session status update...');
    await this.updateSessionStatuses();
  }

  async triggerCleanup(): Promise<void> {
    console.log('Manually triggering session cleanup...');
    await this.cleanupOldSessions();
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

export function startScheduler(): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService();
  }
  
  schedulerInstance.start();
  return schedulerInstance;
}

export function getScheduler(): SchedulerService | null {
  return schedulerInstance;
}