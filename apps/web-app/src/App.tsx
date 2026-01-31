import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box } from '@mui/material'

import { useAppSelector, useAppDispatch } from '@/store'
import { refreshAccessToken } from '@/store/slices/authSlice'
import { fetchNotifications } from '@/store/slices/notificationSlice'
import socketService from '@/services/socket'

// Layout components
import Layout from '@/components/layout/Layout'
import AuthLayout from '@/components/layout/AuthLayout'

// Page components
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import MFASetupPage from '@/pages/auth/MFASetupPage'

import DashboardPage from '@/pages/DashboardPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import EditProfilePage from '@/pages/profile/EditProfilePage'
import PrivacySettingsPage from '@/pages/profile/PrivacySettingsPage'

import SessionsPage from '@/pages/sessions/SessionsPage'
import SessionDetailPage from '@/pages/sessions/SessionDetailPage'
import CreateSessionPage from '@/pages/sessions/CreateSessionPage'
import EditSessionPage from '@/pages/sessions/EditSessionPage'
import MySessionsPage from '@/pages/sessions/MySessionsPage'

import MessagesPage from '@/pages/communication/MessagesPage'
import ConversationPage from '@/pages/communication/ConversationPage'

import NotificationsPage from '@/pages/notifications/NotificationsPage'
import NotificationSettingsPage from '@/pages/notifications/NotificationSettingsPage'

import SearchPage from '@/pages/search/SearchPage'
import MentorsPage from '@/pages/mentors/MentorsPage'
import MentorDetailPage from '@/pages/mentors/MentorDetailPage'

import SettingsPage from '@/pages/settings/SettingsPage'
import AccountSettingsPage from '@/pages/settings/AccountSettingsPage'

// Route guards
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PublicRoute from '@/components/auth/PublicRoute'
import RoleGuard from '@/components/auth/RoleGuard'

// Loading and error components
import LoadingSpinner from '@/components/common/LoadingSpinner'
import ErrorBoundary from '@/components/common/ErrorBoundary'

function App() {
  const dispatch = useAppDispatch()
  const { isAuthenticated, token, user } = useAppSelector((state) => state.auth)
  const [isInitializing, setIsInitializing] = React.useState(true)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check if we have a stored token
        const storedToken = localStorage.getItem('token')
        if (storedToken && !isAuthenticated) {
          // Try to refresh the token to validate it
          await dispatch(refreshAccessToken()).unwrap()
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
        // Token is invalid, clear it
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      } finally {
        setIsInitializing(false)
      }
    }

    initializeApp()
  }, [dispatch, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && token && user) {
      // Connect to socket
      socketService.connect(token)
      
      // Fetch initial notifications
      dispatch(fetchNotifications({}))

      return () => {
        socketService.disconnect()
      }
    }
  }, [isAuthenticated, token, user, dispatch])

  if (isInitializing) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <LoadingSpinner size={60} />
      </Box>
    )
  }

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <AuthLayout>
                <LoginPage />
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <AuthLayout>
                <RegisterPage />
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <AuthLayout>
                <ForgotPasswordPage />
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <AuthLayout>
                <ResetPasswordPage />
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/verify-email"
          element={
            <PublicRoute>
              <AuthLayout>
                <VerifyEmailPage />
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/mfa-setup"
          element={
            <PublicRoute>
              <AuthLayout>
                <MFASetupPage />
              </AuthLayout>
            </PublicRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <HomePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Profile routes */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/:userId"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/edit"
          element={
            <ProtectedRoute>
              <Layout>
                <EditProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/privacy"
          element={
            <ProtectedRoute>
              <Layout>
                <PrivacySettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Session routes */}
        <Route
          path="/sessions"
          element={
            <ProtectedRoute>
              <Layout>
                <SessionsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:sessionId"
          element={
            <ProtectedRoute>
              <Layout>
                <SessionDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/create"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['MENTOR']}>
                <Layout>
                  <CreateSessionPage />
                </Layout>
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:sessionId/edit"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['MENTOR']}>
                <Layout>
                  <EditSessionPage />
                </Layout>
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-sessions"
          element={
            <ProtectedRoute>
              <Layout>
                <MySessionsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Communication routes */}
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Layout>
                <MessagesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages/:conversationId"
          element={
            <ProtectedRoute>
              <Layout>
                <ConversationPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Notification routes */}
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Layout>
                <NotificationsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <NotificationSettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Search and discovery routes */}
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <Layout>
                <SearchPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mentors"
          element={
            <ProtectedRoute>
              <Layout>
                <MentorsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mentors/:mentorId"
          element={
            <ProtectedRoute>
              <Layout>
                <MentorDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Settings routes */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <SettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/account"
          element={
            <ProtectedRoute>
              <Layout>
                <AccountSettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App