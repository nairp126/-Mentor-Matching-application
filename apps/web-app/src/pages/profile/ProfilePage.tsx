import React from 'react'
import { Typography, Box } from '@mui/material'

const ProfilePage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Profile
      </Typography>
      <Typography variant="body1">
        User profile page will be implemented here.
      </Typography>
    </Box>
  )
}

export default ProfilePage