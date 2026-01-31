// Global test setup
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = 'postgresql://test_user:test_password@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'STUDENT',
    ...overrides
  }),
  
  createMockSession: (overrides = {}) => ({
    id: 'test-session-id',
    mentorId: 'test-mentor-id',
    title: 'Test Session',
    description: 'Test session description',
    expertiseAreas: ['JavaScript'],
    sessionType: 'ONE_ON_ONE',
    scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
    duration: 60,
    capacity: 1,
    currentRegistrations: 0,
    status: 'SCHEDULED',
    ...overrides
  })
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});