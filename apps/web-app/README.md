# Mentor Matching Platform - Web Application

A modern React-based web application for the Mentor Matching Platform, built with TypeScript, Material-UI, and Redux Toolkit.

## Features

### 🔐 Authentication & Security

- User registration and login with email verification
- Multi-factor authentication (MFA) support
- Password reset functionality
- JWT-based authentication with automatic token refresh
- Role-based access control (Student, Mentor, Admin)

### 👤 User Management

- Comprehensive user profiles for mentors and students
- Profile image upload and management
- Privacy settings and visibility controls
- Mentor availability scheduling
- Student learning goals and preferences

### 📚 Session Management

- Browse and filter available mentoring sessions
- Session creation and editing (for mentors)
- Registration and waitlist management
- Recurring session support
- Session materials and resources
- Real-time session updates

### 💬 Real-time Communication

- Instant messaging between users
- Video call integration
- File sharing in conversations
- Typing indicators and read receipts
- Online presence indicators

### 🔔 Notifications

- Multi-channel notifications (in-app, email, SMS)
- Customizable notification preferences
- Session reminders and updates
- Real-time notification delivery

### 🔍 Search & Discovery

- Advanced search and filtering
- Personalized session recommendations
- Mentor discovery and matching
- Trending sessions and popular mentors

### 📊 Analytics & Insights

- Personal dashboards for students and mentors
- Learning progress tracking
- Session analytics and performance metrics
- Goal tracking and achievements

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v5
- **State Management**: Redux Toolkit
- **Routing**: React Router v6
- **Forms**: React Hook Form with Yup validation
- **HTTP Client**: Axios
- **Real-time**: Socket.IO Client
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library
- **Styling**: Emotion (CSS-in-JS)

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── auth/           # Authentication components
│   ├── common/         # Common/shared components
│   └── layout/         # Layout components
├── pages/              # Page components
│   ├── auth/           # Authentication pages
│   ├── communication/ # Messaging pages
│   ├── mentors/        # Mentor-related pages
│   ├── notifications/  # Notification pages
│   ├── profile/        # Profile pages
│   ├── search/         # Search pages
│   ├── sessions/       # Session pages
│   └── settings/       # Settings pages
├── services/           # API and external services
│   ├── api/            # API service modules
│   └── socket.ts       # Socket.IO service
├── store/              # Redux store configuration
│   └── slices/         # Redux slices
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── test/               # Test utilities and setup
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Backend services running (see main README)

### Installation

1. Install dependencies:

```bash
npm install
```

1. Set up environment variables:

```bash
cp .env.example .env.local
```

1. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run test:ui` - Run tests with UI

## Environment Variables

Create a `.env.local` file with the following variables:

```env
VITE_API_URL=http://localhost:8080/api
VITE_SOCKET_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Key Features Implementation

### Authentication Flow

- JWT tokens stored in localStorage with automatic refresh
- Protected routes with role-based access control
- MFA support with TOTP authentication
- Social login integration (Google OAuth)

### Real-time Features

- Socket.IO integration for live messaging
- Real-time notifications and updates
- Online presence indicators
- Typing indicators in conversations

### State Management

- Redux Toolkit for predictable state management
- Separate slices for different domains (auth, user, sessions, etc.)
- Async thunks for API calls
- Optimistic updates for better UX

### UI/UX Design

- Material Design principles with Material-UI
- Responsive design for mobile and desktop
- Dark/light theme support
- Accessibility features (ARIA labels, keyboard navigation)
- Loading states and error handling

### Performance Optimizations

- Code splitting with React.lazy
- Image optimization and lazy loading
- Virtual scrolling for large lists
- Memoization of expensive computations
- Bundle size optimization

## Testing Strategy

- Unit tests for components and utilities
- Integration tests for user flows
- API mocking for isolated testing
- Accessibility testing
- Performance testing

## Deployment

The application is configured for deployment to various platforms:

- **Vercel/Netlify**: Static deployment with SPA routing
- **Docker**: Containerized deployment
- **AWS S3 + CloudFront**: CDN deployment

Build the application:

```bash
npm run build
```

The `dist` folder contains the production build ready for deployment.

## Contributing

1. Follow the established code style and patterns
2. Write tests for new features
3. Update documentation as needed
4. Use conventional commit messages
5. Ensure all tests pass before submitting PRs

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Targets

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s
- Cumulative Layout Shift: < 0.1
