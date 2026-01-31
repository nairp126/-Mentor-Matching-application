import React from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import { School as SchoolIcon } from '@mui/icons-material'

interface AuthLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ 
  children, 
  subtitle = 'Connect with mentors and students for meaningful learning experiences'
}) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 4,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <SchoolIcon
              sx={{
                fontSize: 48,
                color: 'white',
                mr: 2,
              }}
            />
            <Typography
              variant={isMobile ? 'h4' : 'h3'}
              component="h1"
              sx={{
                color: 'white',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Mentor Platform
            </Typography>
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: 'rgba(255, 255, 255, 0.8)',
              textAlign: 'center',
              maxWidth: 400,
            }}
          >
            {subtitle}
          </Typography>
        </Box>

        <Paper
          elevation={8}
          sx={{
            p: isMobile ? 3 : 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {children}
        </Paper>

        <Box
          sx={{
            mt: 4,
            textAlign: 'center',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            © 2024 Mentor Platform. All rights reserved.
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

export default AuthLayout