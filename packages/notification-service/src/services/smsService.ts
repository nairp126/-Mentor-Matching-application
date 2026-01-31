import { Twilio } from 'twilio';
import { Notification } from './notificationService';

export class SMSService {
  private client: Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';

    if (!accountSid || !authToken) {
      console.warn('Twilio credentials not configured. SMS notifications will be disabled.');
      // Create a mock client for development
      this.client = {} as Twilio;
    } else {
      this.client = new Twilio(accountSid, authToken);
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(notification: Notification): Promise<void> {
    // Get user phone number
    const phoneNumber = await this.getUserPhoneNumber(notification.userId);
    if (!phoneNumber) {
      throw new Error(`No phone number found for user ${notification.userId}`);
    }

    // Format message for SMS (keep it concise)
    const smsMessage = this.formatSMSMessage(notification);

    try {
      if (process.env.NODE_ENV === 'development' || !this.client.messages) {
        // Mock SMS sending in development
        console.log(`[SMS Mock] To: ${phoneNumber}, Message: ${smsMessage}`);
        return;
      }

      await this.client.messages.create({
        body: smsMessage,
        from: this.fromNumber,
        to: phoneNumber
      });
    } catch (error) {
      throw new Error(`Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format notification message for SMS
   */
  private formatSMSMessage(notification: Notification): string {
    const baseMessage = `${notification.title}: ${notification.message}`;
    
    // Add specific formatting based on notification type
    switch (notification.type) {
      case 'SESSION_REMINDER':
        const scheduledAt = notification.metadata?.scheduledAt;
        return `Reminder: ${notification.title} starting ${scheduledAt ? `at ${scheduledAt}` : 'soon'}. ${notification.message}`;
      
      case 'SESSION_CANCELLED':
        return `CANCELLED: ${notification.title}. ${notification.message}`;
      
      case 'WAITLIST_PROMOTED':
        return `Spot available! ${notification.title}. Confirm registration ASAP. ${notification.message}`;
      
      case 'NEW_MESSAGE':
        const senderName = notification.metadata?.senderName || 'Someone';
        return `New message from ${senderName}: ${notification.message}`;
      
      case 'REGISTRATION_CONFIRMED':
        return `Confirmed: ${notification.title}. ${notification.message}`;
      
      case 'REVIEW_REQUEST':
        return `Please review your session: ${notification.title}. ${notification.message}`;
      
      case 'SYSTEM_ALERT':
        return `ALERT: ${notification.title}. ${notification.message}`;
      
      default:
        return baseMessage;
    }
  }

  /**
   * Get user phone number
   */
  private async getUserPhoneNumber(userId: string): Promise<string | null> {
    // This would typically query the user database for phone number
    // For now, we'll use environment variable or mock
    return process.env.TEST_PHONE_NUMBER || null;
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic phone number validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }
}