import React from 'react'
import { Typography, Box } from '@mui/material'

const NotificationSettingsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Notification Settings
      </Typography>
      <Typography variant="body1">
        Notification preferences will be implemented here.
      </Typography>
    </Box>
  )
}

export default NotificationSettingsPage