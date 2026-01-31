import React from 'react'
import { Typography, Box } from '@mui/material'

const MySessionsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        My Sessions
      </Typography>
      <Typography variant="body1">
        User's sessions dashboard will be implemented here.
      </Typography>
    </Box>
  )
}

export default MySessionsPage