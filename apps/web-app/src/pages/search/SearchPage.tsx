import React from 'react'
import { Typography, Box } from '@mui/material'

const SearchPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Search
      </Typography>
      <Typography variant="body1">
        Advanced search and filtering will be implemented here.
      </Typography>
    </Box>
  )
}

export default SearchPage