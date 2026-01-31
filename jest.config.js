module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@mentor-platform/shared$': '<rootDir>/packages/shared/src',
    '^@auth/(.*)$': '<rootDir>/packages/auth-service/src/$1',
    '^@user/(.*)$': '<rootDir>/packages/user-service/src/$1',
    '^@session/(.*)$': '<rootDir>/packages/session-service/src/$1',
    '^@matching/(.*)$': '<rootDir>/packages/matching-service/src/$1',
    '^@communication/(.*)$': '<rootDir>/packages/communication-service/src/$1',
    '^@notification/(.*)$': '<rootDir>/packages/notification-service/src/$1',
    '^@gateway/(.*)$': '<rootDir>/packages/api-gateway/src/$1'
  },
  testTimeout: 30000,
  verbose: true
};