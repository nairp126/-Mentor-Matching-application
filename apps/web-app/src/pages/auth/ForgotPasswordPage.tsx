import React from 'react'
import { Typography, Box } from '@mui/material'

const ForgotPasswordPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom textAlign="center">
        Forgot Password
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Password reset functionality will be implemented here.
      </Typography>
    </Box>
  )
}

export default ForgotPasswordPage