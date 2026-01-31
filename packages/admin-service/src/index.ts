import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { adminRoutes } from './routes/admin';
import { userManagementRoutes } from './routes/userManagement';
import { systemMetricsRoutes } from './routes/systemMetrics';
import { auditRoutes } from './routes/audit';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.ADMIN_SERVICE_PORT || 3007;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'admin-service',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/users', userManagementRoutes);
app.use('/api/admin/metrics', systemMetricsRoutes);
app.use('/api/admin/audit', auditRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Admin service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;