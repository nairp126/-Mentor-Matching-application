import React from 'react'
import { Typography, Box } from '@mui/material'

const MFASetupPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom textAlign="center">
        MFA Setup
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Multi-factor authentication setup will be implemented here.
      </Typography>
    </Box>
  )
}

export default MFASetupPage