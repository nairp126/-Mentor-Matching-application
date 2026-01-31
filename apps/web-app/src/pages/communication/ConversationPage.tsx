import React from 'react'
import { Typography, Box } from '@mui/material'

const ConversationPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Conversation
      </Typography>
      <Typography variant="body1">
        Individual conversation view will be implemented here.
      </Typography>
    </Box>
  )
}

export default ConversationPage