import React from 'react'
import { Navigate } from 'react-router-dom'
import { Box, Typography, Button } from '@mui/material'
import { Lock as LockIcon } from '@mui/icons-material'
import { useAppSelector } from '@/store'
import { UserRole } from '@/types'

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
  fallbackPath?: string
  showAccessDenied?: boolean
}

const RoleGuard: React.FC<RoleGuardProps> = ({ 
  children, 
  allowedRoles, 
  fallbackPath = '/dashboard',
  showAccessDenied = true 
}) => {
  const { user } = useAppSelector((state) => state.auth)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const hasRequiredRole = allowedRoles.includes(user.role)

  if (!hasRequiredRole) {
    if (!showAccessDenied) {
      return <Navigate to={fallbackPath} replace />
    }

    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="60vh"
        textAlign="center"
        p={4}
      >
        <LockIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h4" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={3}>
          You don't have permission to access this page.
          {allowedRoles.length === 1 && (
            <> This page is only available to {allowedRoles[0].toLowerCase()}s.</>
          )}
        </Typography>
        <Button
          variant="contained"
          onClick={() => window.history.back()}
          sx={{ mr: 2 }}
        >
          Go Back
        </Button>
        <Button
          variant="outlined"
          onClick={() => window.location.href = fallbackPath}
        >
          Go to Dashboard
        </Button>
      </Box>
    )
  }

  return <>{children}</>
}

export default RoleGuard