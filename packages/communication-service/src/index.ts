import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();
import { messageRoutes } from './routes/messages';
import { conversationRoutes } from './routes/conversations';
import { fileRoutes } from './routes/files';
import { videoCallRoutes } from './routes/videoCalls';
import { SocketManager } from './services/socketManager';
import { MessageService } from './services/messageService';
import { ConversationService } from './services/conversationService';
import { VideoCallService } from './services/videoCallService';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3005;

// Initialize Socket.IO with CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for real-time communication
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // Higher limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'communication-service',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

// Initialize services
const messageService = new MessageService();
const conversationService = new ConversationService();
const videoCallService = new VideoCallService();
const socketManager = new SocketManager(io, messageService, conversationService, videoCallService);

// API routes
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/video-calls', videoCallRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
server.listen(PORT, () => {
  console.log(`Communication service running on port ${PORT}`);
  console.log(`Socket.IO server ready for real-time connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Communication service stopped');
    process.exit(0);
  });
});

export default app;