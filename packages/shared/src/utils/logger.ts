import winston from 'winston';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug'
}

// Log context interface
export interface LogContext {
  userId?: string;
  requestId?: string;
  sessionId?: string;
  service?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTime?: number;
  userAgent?: string;
  ip?: string;
  [key: string]: any;
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info: any) => {
    const { timestamp, level, message, service, ...meta } = info;
    const logEntry = {
      timestamp,
      level,
      message,
      service: service || process.env.SERVICE_NAME || 'unknown',
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'mentor-platform'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for production
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add HTTP transport for centralized logging in production
if (process.env.NODE_ENV === 'production' && process.env.LOG_ENDPOINT) {
  logger.add(new winston.transports.Http({
    host: process.env.LOG_HOST || 'localhost',
    port: parseInt(process.env.LOG_PORT || '3100'),
    path: process.env.LOG_PATH || '/loki/api/v1/push'
  }));
}

// Logger class with context support
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  // Create child logger with additional context
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  // Log methods
  error(message: string, error?: Error, context?: LogContext): void {
    logger.error(message, {
      ...this.context,
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  warn(message: string, context?: LogContext): void {
    logger.warn(message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    logger.info(message, { ...this.context, ...context });
  }

  http(message: string, context?: LogContext): void {
    logger.http(message, { ...this.context, ...context });
  }

  debug(message: string, context?: LogContext): void {
    logger.debug(message, { ...this.context, ...context });
  }

  // Specialized logging methods
  logRequest(req: any, res: any, responseTime: number): void {
    this.http('HTTP Request', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.userId,
      requestId: req.id
    });
  }

  logDatabaseQuery(query: string, duration: number, context?: LogContext): void {
    this.debug('Database Query', {
      query: query.substring(0, 200), // Truncate long queries
      duration,
      ...context
    });
  }

  logCacheOperation(operation: string, key: string, hit: boolean, context?: LogContext): void {
    this.debug('Cache Operation', {
      operation,
      key,
      hit,
      ...context
    });
  }

  logSecurityEvent(event: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', context?: LogContext): void {
    this.warn('Security Event', {
      event,
      severity,
      ...context
    });
  }

  logBusinessEvent(event: string, context?: LogContext): void {
    this.info('Business Event', {
      event,
      ...context
    });
  }

  logPerformanceMetric(metric: string, value: number, unit: string, context?: LogContext): void {
    this.info('Performance Metric', {
      metric,
      value,
      unit,
      ...context
    });
  }
}

// Default logger instance
export const defaultLogger = new Logger();

// Express middleware for request logging
export const requestLoggingMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  // Generate request ID if not present
  req.id = req.id || Math.random().toString(36).substring(2, 15);
  
  // Create request-specific logger
  req.logger = new Logger({
    requestId: req.id,
    service: process.env.SERVICE_NAME
  });

  // Log request completion
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    req.logger.logRequest(req, res, responseTime);
  });

  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (error: Error, req: any, res: any, next: any) => {
  const logger = req.logger || defaultLogger;
  
  logger.error('Unhandled Error', error, {
    method: req.method,
    url: req.originalUrl || req.url,
    userId: req.user?.userId,
    requestId: req.id
  });

  next(error);
};

export default Logger;