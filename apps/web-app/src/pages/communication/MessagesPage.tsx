import React from 'react'
import { Typography, Box } from '@mui/material'

const MessagesPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Messages
      </Typography>
      <Typography variant="body1">
        Real-time messaging interface will be implemented here.
      </Typography>
    </Box>
  )
}

export default MessagesPage