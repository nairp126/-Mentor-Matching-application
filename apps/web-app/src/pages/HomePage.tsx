import React, { useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Container,
  Avatar,
  Chip,
  Rating,
} from '@mui/material'
import {
  TrendingUp as TrendingIcon,
  School as SessionIcon,
  People as MentorIcon,
  Star as StarIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { setPageTitle } from '@/store/slices/uiSlice'

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    dispatch(setPageTitle('Home'))
  }, [dispatch])

  const featuredSessions = [
    {
      id: '1',
      title: 'Introduction to React Development',
      mentor: 'Sarah Johnson',
      rating: 4.8,
      price: 50,
      duration: 60,
      tags: ['React', 'JavaScript', 'Frontend'],
    },
    {
      id: '2',
      title: 'Career Guidance for Software Engineers',
      mentor: 'Michael Chen',
      rating: 4.9,
      price: 75,
      duration: 90,
      tags: ['Career', 'Software Engineering', 'Leadership'],
    },
    {
      id: '3',
      title: 'Data Science Fundamentals',
      mentor: 'Dr. Emily Rodriguez',
      rating: 4.7,
      price: 60,
      duration: 120,
      tags: ['Data Science', 'Python', 'Machine Learning'],
    },
  ]

  const topMentors = [
    {
      id: '1',
      name: 'Sarah Johnson',
      expertise: 'Frontend Development',
      rating: 4.8,
      sessions: 150,
      avatar: '/avatars/sarah.jpg',
    },
    {
      id: '2',
      name: 'Michael Chen',
      expertise: 'Software Architecture',
      rating: 4.9,
      sessions: 200,
      avatar: '/avatars/michael.jpg',
    },
    {
      id: '3',
      name: 'Dr. Emily Rodriguez',
      expertise: 'Data Science',
      rating: 4.7,
      sessions: 120,
      avatar: '/avatars/emily.jpg',
    },
  ]

  return (
    <Container maxWidth="lg">
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Welcome back, {user?.profile?.firstName || 'there'}! 👋
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Discover amazing mentoring opportunities and connect with experts in your field.
        </Typography>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <SessionIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">1,234</Typography>
                  <Typography color="text.secondary">Active Sessions</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <MentorIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">567</Typography>
                  <Typography color="text.secondary">Expert Mentors</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">89%</Typography>
                  <Typography color="text.secondary">Success Rate</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <StarIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">4.8</Typography>
                  <Typography color="text.secondary">Avg Rating</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Featured Sessions */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" component="h2">
            Featured Sessions
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/sessions')}>
            View All
          </Button>
        </Box>
        <Grid container spacing={3}>
          {featuredSessions.map((session) => (
            <Grid item xs={12} md={4} key={session.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {session.title}
                  </Typography>
                  <Typography color="text.secondary" gutterBottom>
                    by {session.mentor}
                  </Typography>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Rating value={session.rating} readOnly size="small" />
                    <Typography variant="body2" ml={1}>
                      ({session.rating})
                    </Typography>
                  </Box>
                  <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                    {session.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" color="primary">
                      ${session.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {session.duration} min
                    </Typography>
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    sx={{ mt: 2 }}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    View Details
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Top Mentors */}
      <Box mb={4}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" component="h2">
            Top Mentors
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/mentors')}>
            View All
          </Button>
        </Box>
        <Grid container spacing={3}>
          {topMentors.map((mentor) => (
            <Grid item xs={12} sm={6} md={4} key={mentor.id}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Avatar
                      src={mentor.avatar}
                      sx={{ width: 56, height: 56, mr: 2 }}
                    >
                      {mentor.name[0]}
                    </Avatar>
                    <Box>
                      <Typography variant="h6">{mentor.name}</Typography>
                      <Typography color="text.secondary">
                        {mentor.expertise}
                      </Typography>
                    </Box>
                  </Box>
                  <Box display="flex" alignItems="center" mb={1}>
                    <Rating value={mentor.rating} readOnly size="small" />
                    <Typography variant="body2" ml={1}>
                      ({mentor.rating})
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {mentor.sessions} sessions completed
                  </Typography>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => navigate(`/mentors/${mentor.id}`)}
                  >
                    View Profile
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  )
}

export default HomePage