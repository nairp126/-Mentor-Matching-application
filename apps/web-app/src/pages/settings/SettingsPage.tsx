import React from 'react'
import { Typography, Box } from '@mui/material'

const SettingsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body1">
        Application settings will be implemented here.
      </Typography>
    </Box>
  )
}

export default SettingsPage