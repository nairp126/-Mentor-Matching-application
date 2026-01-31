import React, { useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Container,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  LinearProgress,
} from '@mui/material'
import {
  Event as EventIcon,
  TrendingUp as TrendingIcon,
  Assignment as AssignmentIcon,
  Notifications as NotificationIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { setPageTitle } from '@/store/slices/uiSlice'

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    dispatch(setPageTitle('Dashboard'))
  }, [dispatch])

  const isMentor = user?.role === 'MENTOR'

  const upcomingSessions = [
    {
      id: '1',
      title: 'React Development Session',
      participant: isMentor ? 'John Doe' : 'Sarah Johnson',
      time: '2:00 PM Today',
      type: 'Video Call',
    },
    {
      id: '2',
      title: 'Career Guidance',
      participant: isMentor ? 'Jane Smith' : 'Michael Chen',
      time: '10:00 AM Tomorrow',
      type: 'In-Person',
    },
  ]

  const recentActivity = [
    {
      id: '1',
      action: 'Session completed',
      details: 'React Development with Sarah Johnson',
      time: '2 hours ago',
    },
    {
      id: '2',
      action: 'New message',
      details: 'From Michael Chen about upcoming session',
      time: '4 hours ago',
    },
    {
      id: '3',
      action: 'Session booked',
      details: 'Career Guidance session for tomorrow',
      time: '1 day ago',
    },
  ]

  const stats = isMentor
    ? [
        { label: 'Total Sessions', value: 45, icon: <EventIcon /> },
        { label: 'This Month', value: 12, icon: <TrendingIcon /> },
        { label: 'Rating', value: '4.8', icon: <AssignmentIcon /> },
        { label: 'Earnings', value: '$2,340', icon: <NotificationIcon /> },
      ]
    : [
        { label: 'Sessions Attended', value: 23, icon: <EventIcon /> },
        { label: 'This Month', value: 5, icon: <TrendingIcon /> },
        { label: 'Learning Goals', value: '8/10', icon: <AssignmentIcon /> },
        { label: 'Certificates', value: 3, icon: <NotificationIcon /> },
      ]

  return (
    <Container maxWidth="lg">
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          {isMentor ? 'Mentor Dashboard' : 'Student Dashboard'}
        </Typography>
        <Typography variant="h6" color="text.secondary">
          {isMentor
            ? 'Manage your mentoring sessions and track your impact'
            : 'Track your learning progress and upcoming sessions'}
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'primary.light',
                      color: 'primary.contrastText',
                      mr: 2,
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Box>
                    <Typography variant="h4">{stat.value}</Typography>
                    <Typography color="text.secondary">{stat.label}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Upcoming Sessions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h5">Upcoming Sessions</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => navigate('/my-sessions')}
                >
                  View All
                </Button>
              </Box>
              <List>
                {upcomingSessions.map((session) => (
                  <ListItem key={session.id} divider>
                    <ListItemAvatar>
                      <Avatar>
                        <EventIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={session.title}
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {isMentor ? 'Student: ' : 'Mentor: '}{session.participant}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {session.time} • {session.type}
                          </Typography>
                        </Box>
                      }
                    />
                    <Chip label="Join" color="primary" size="small" />
                  </ListItem>
                ))}
              </List>
              {isMentor && (
                <Button
                  fullWidth
                  variant="contained"
                  sx={{ mt: 2 }}
                  onClick={() => navigate('/sessions/create')}
                >
                  Create New Session
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" mb={2}>
                Recent Activity
              </Typography>
              <List>
                {recentActivity.map((activity) => (
                  <ListItem key={activity.id} divider>
                    <ListItemText
                      primary={activity.action}
                      secondary={
                        <Box>
                          <Typography variant="body2">{activity.details}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {activity.time}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Learning Progress (Student) or Performance (Mentor) */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h5" mb={3}>
                {isMentor ? 'Performance Overview' : 'Learning Progress'}
              </Typography>
              <Grid container spacing={3}>
                {isMentor ? (
                  <>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        Session Completion Rate
                      </Typography>
                      <LinearProgress variant="determinate" value={95} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        95%
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        Student Satisfaction
                      </Typography>
                      <LinearProgress variant="determinate" value={88} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        4.8/5.0
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        Monthly Goal
                      </Typography>
                      <LinearProgress variant="determinate" value={75} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        12/16 sessions
                      </Typography>
                    </Grid>
                  </>
                ) : (
                  <>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        React Development
                      </Typography>
                      <LinearProgress variant="determinate" value={80} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        80% Complete
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        Career Development
                      </Typography>
                      <LinearProgress variant="determinate" value={60} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        60% Complete
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" gutterBottom>
                        Data Science
                      </Typography>
                      <LinearProgress variant="determinate" value={30} sx={{ mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        30% Complete
                      </Typography>
                    </Grid>
                  </>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  )
}

export default DashboardPage