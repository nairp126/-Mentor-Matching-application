import React from 'react'
import { Typography, Box } from '@mui/material'

const AccountSettingsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Account Settings
      </Typography>
      <Typography variant="body1">
        Account management settings will be implemented here.
      </Typography>
    </Box>
  )
}

export default AccountSettingsPage