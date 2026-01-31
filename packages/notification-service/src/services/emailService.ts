import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { Notification } from './notificationService';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    this.initializeTemplates();
  }

  /**
   * Send email notification
   */
  async sendEmail(notification: Notification): Promise<void> {
    // Get user email from database or metadata
    const userEmail = await this.getUserEmail(notification.userId);
    if (!userEmail) {
      throw new Error(`No email address found for user ${notification.userId}`);
    }

    // Get or create email template
    const template = this.getTemplate(notification.type);

    // Compile template with notification data
    const compiledSubject = Handlebars.compile(template.subject);
    const compiledHtml = Handlebars.compile(template.html);
    const compiledText = Handlebars.compile(template.text);

    const templateData = {
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || {},
      user: await this.getUserData(notification.userId)
    };

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@mentorplatform.com',
      to: userEmail,
      subject: compiledSubject(templateData),
      html: compiledHtml(templateData),
      text: compiledText(templateData)
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize email templates
   */
  private initializeTemplates(): void {
    // Session reminder template
    this.templates.set('SESSION_REMINDER', {
      subject: 'Reminder: {{title}} - Starting Soon',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Session Reminder</h2>
          <p>Hi {{user.firstName}},</p>
          <p>This is a friendly reminder that your mentoring session is starting soon:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">{{title}}</h3>
            <p><strong>Time:</strong> {{metadata.scheduledAt}}</p>
            <p><strong>Duration:</strong> {{metadata.duration}} minutes</p>
            {{#if metadata.meetingLink}}
            <p><strong>Meeting Link:</strong> <a href="{{metadata.meetingLink}}">Join Session</a></p>
            {{/if}}
          </div>
          
          <p>{{message}}</p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        Session Reminder
        
        Hi {{user.firstName}},
        
        This is a friendly reminder that your mentoring session is starting soon:
        
        {{title}}
        Time: {{metadata.scheduledAt}}
        Duration: {{metadata.duration}} minutes
        {{#if metadata.meetingLink}}Meeting Link: {{metadata.meetingLink}}{{/if}}
        
        {{message}}
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // Session cancelled template
    this.templates.set('SESSION_CANCELLED', {
      subject: 'Session Cancelled: {{title}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">Session Cancelled</h2>
          <p>Hi {{user.firstName}},</p>
          <p>We regret to inform you that the following session has been cancelled:</p>
          
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin-top: 0; color: #721c24;">{{title}}</h3>
            <p><strong>Originally scheduled:</strong> {{metadata.scheduledAt}}</p>
            {{#if metadata.reason}}
            <p><strong>Reason:</strong> {{metadata.reason}}</p>
            {{/if}}
          </div>
          
          <p>{{message}}</p>
          
          {{#if metadata.rescheduleLink}}
          <p><a href="{{metadata.rescheduleLink}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reschedule Session</a></p>
          {{/if}}
          
          <p>We apologize for any inconvenience caused.</p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        Session Cancelled
        
        Hi {{user.firstName}},
        
        We regret to inform you that the following session has been cancelled:
        
        {{title}}
        Originally scheduled: {{metadata.scheduledAt}}
        {{#if metadata.reason}}Reason: {{metadata.reason}}{{/if}}
        
        {{message}}
        
        {{#if metadata.rescheduleLink}}Reschedule: {{metadata.rescheduleLink}}{{/if}}
        
        We apologize for any inconvenience caused.
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // New message template
    this.templates.set('NEW_MESSAGE', {
      subject: 'New Message from {{metadata.senderName}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">New Message</h2>
          <p>Hi {{user.firstName}},</p>
          <p>You have received a new message from {{metadata.senderName}}:</p>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; font-style: italic;">"{{message}}"</p>
          </div>
          
          <p><a href="{{metadata.conversationLink}}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Conversation</a></p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        New Message
        
        Hi {{user.firstName}},
        
        You have received a new message from {{metadata.senderName}}:
        
        "{{message}}"
        
        View conversation: {{metadata.conversationLink}}
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // Registration confirmed template
    this.templates.set('REGISTRATION_CONFIRMED', {
      subject: 'Registration Confirmed: {{title}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">Registration Confirmed</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Your registration for the following session has been confirmed:</p>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin-top: 0; color: #155724;">{{title}}</h3>
            <p><strong>Mentor:</strong> {{metadata.mentorName}}</p>
            <p><strong>Date & Time:</strong> {{metadata.scheduledAt}}</p>
            <p><strong>Duration:</strong> {{metadata.duration}} minutes</p>
          </div>
          
          <p>{{message}}</p>
          
          <p>We'll send you a reminder before the session starts.</p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        Registration Confirmed
        
        Hi {{user.firstName}},
        
        Your registration for the following session has been confirmed:
        
        {{title}}
        Mentor: {{metadata.mentorName}}
        Date & Time: {{metadata.scheduledAt}}
        Duration: {{metadata.duration}} minutes
        
        {{message}}
        
        We'll send you a reminder before the session starts.
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // Waitlist promoted template
    this.templates.set('WAITLIST_PROMOTED', {
      subject: 'Great News! Spot Available: {{title}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ffc107;">Spot Available!</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Great news! A spot has become available in the session you were waitlisted for:</p>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin-top: 0; color: #856404;">{{title}}</h3>
            <p><strong>Mentor:</strong> {{metadata.mentorName}}</p>
            <p><strong>Date & Time:</strong> {{metadata.scheduledAt}}</p>
            <p><strong>Duration:</strong> {{metadata.duration}} minutes</p>
          </div>
          
          <p>{{message}}</p>
          
          <p><strong>Action Required:</strong> Please confirm your registration within {{metadata.confirmationDeadline}} to secure your spot.</p>
          
          <p><a href="{{metadata.confirmationLink}}" style="background-color: #ffc107; color: #212529; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Confirm Registration</a></p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        Spot Available!
        
        Hi {{user.firstName}},
        
        Great news! A spot has become available in the session you were waitlisted for:
        
        {{title}}
        Mentor: {{metadata.mentorName}}
        Date & Time: {{metadata.scheduledAt}}
        Duration: {{metadata.duration}} minutes
        
        {{message}}
        
        Action Required: Please confirm your registration within {{metadata.confirmationDeadline}} to secure your spot.
        
        Confirm registration: {{metadata.confirmationLink}}
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // Review request template
    this.templates.set('REVIEW_REQUEST', {
      subject: 'How was your session? Please share your feedback',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6f42c1;">Session Feedback</h2>
          <p>Hi {{user.firstName}},</p>
          <p>We hope you had a great mentoring session! We'd love to hear about your experience:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">{{title}}</h3>
            <p><strong>Mentor:</strong> {{metadata.mentorName}}</p>
            <p><strong>Date:</strong> {{metadata.sessionDate}}</p>
          </div>
          
          <p>{{message}}</p>
          
          <p>Your feedback helps us maintain quality and helps other students make informed decisions.</p>
          
          <p><a href="{{metadata.reviewLink}}" style="background-color: #6f42c1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Leave Review</a></p>
          
          <p>Thank you for being part of our community!</p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        Session Feedback
        
        Hi {{user.firstName}},
        
        We hope you had a great mentoring session! We'd love to hear about your experience:
        
        {{title}}
        Mentor: {{metadata.mentorName}}
        Date: {{metadata.sessionDate}}
        
        {{message}}
        
        Your feedback helps us maintain quality and helps other students make informed decisions.
        
        Leave review: {{metadata.reviewLink}}
        
        Thank you for being part of our community!
        
        Best regards,
        The Mentor Platform Team
      `
    });

    // System alert template
    this.templates.set('SYSTEM_ALERT', {
      subject: 'System Alert: {{title}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">System Alert</h2>
          <p>Hi {{user.firstName}},</p>
          
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin-top: 0; color: #721c24;">{{title}}</h3>
            <p>{{message}}</p>
          </div>
          
          {{#if metadata.actionRequired}}
          <p><strong>Action Required:</strong> {{metadata.actionRequired}}</p>
          {{/if}}
          
          {{#if metadata.actionLink}}
          <p><a href="{{metadata.actionLink}}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Take Action</a></p>
          {{/if}}
          
          <p>If you have any questions, please contact our support team.</p>
          
          <p>Best regards,<br>The Mentor Platform Team</p>
        </div>
      `,
      text: `
        System Alert
        
        Hi {{user.firstName}},
        
        {{title}}
        
        {{message}}
        
        {{#if metadata.actionRequired}}Action Required: {{metadata.actionRequired}}{{/if}}
        
        {{#if metadata.actionLink}}Take action: {{metadata.actionLink}}{{/if}}
        
        If you have any questions, please contact our support team.
        
        Best regards,
        The Mentor Platform Team
      `
    });
  }

  /**
   * Get email template for notification type
   */
  private getTemplate(type: string): EmailTemplate {
    const template = this.templates.get(type);
    if (!template) {
      // Return generic template
      return {
        subject: '{{title}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>{{title}}</h2>
            <p>Hi {{user.firstName}},</p>
            <p>{{message}}</p>
            <p>Best regards,<br>The Mentor Platform Team</p>
          </div>
        `,
        text: `
          {{title}}
          
          Hi {{user.firstName}},
          
          {{message}}
          
          Best regards,
          The Mentor Platform Team
        `
      };
    }
    return template;
  }

  /**
   * Get user email address
   */
  private async getUserEmail(userId: string): Promise<string | null> {
    // This would typically query the user database
    // For now, we'll use environment variable or mock
    return process.env.TEST_EMAIL || null;
  }

  /**
   * Get user data for template
   */
  private async getUserData(userId: string): Promise<any> {
    // This would typically query the user database
    // For now, return mock data
    return {
      firstName: 'User',
      lastName: 'Name'
    };
  }
}