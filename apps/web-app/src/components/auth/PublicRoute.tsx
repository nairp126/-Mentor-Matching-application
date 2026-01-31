import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/store'

interface PublicRouteProps {
  children: React.ReactNode
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)

  if (isAuthenticated && user?.emailVerified) {
    // Redirect authenticated users to dashboard
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default PublicRoute