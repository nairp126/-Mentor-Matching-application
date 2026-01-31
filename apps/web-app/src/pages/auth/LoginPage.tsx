import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Email as EmailIcon,
  Lock as LockIcon,
  Google as GoogleIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { toast } from 'react-toastify'

import { useAppDispatch, useAppSelector } from '@/store'
import { login, clearError } from '@/store/slices/authSlice'
import { LoginCredentials } from '@/types'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import MFADialog from '@/components/auth/MFADialog'

const schema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .required('Password is required'),
  rememberMe: yup.boolean().default(false),
})

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()

  const { isLoading, error, mfaRequired } = useAppSelector((state) => state.auth)

  const [showPassword, setShowPassword] = useState(false)
  const [mfaToken, setMfaToken] = useState<string | null>(null)

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials & { rememberMe: boolean }>({
    resolver: yupResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  })

  useEffect(() => {
    // Clear any previous errors when component mounts
    dispatch(clearError())
  }, [dispatch])

  const onSubmit = async (data: LoginCredentials & { rememberMe: boolean }) => {
    try {
      const result = await dispatch(login({
        email: data.email,
        password: data.password,
      })).unwrap()

      alert('Login Action Success! Token: ' + (result.accessToken ? 'Yes' : 'No') + ' User: ' + (result.user ? 'Yes' : 'No'));
      toast.success('Login successful!')
      console.log('Navigating to:', from);
      alert('Navigating to: ' + from);
      navigate(from, { replace: true })
    } catch (error: any) {
      alert('Login Error Caught: ' + JSON.stringify(error));
      if (error === 'MFA_REQUIRED') {
        // MFA is required, show MFA dialog
        setMfaToken('temp_token') // In real app, this would come from the API
      } else {
        toast.error(error || 'Login failed')
      }
    }
  }

  const handleMFASuccess = () => {
    setMfaToken(null)
    toast.success('Login successful!')
    navigate(from, { replace: true })
  }

  const handleMFACancel = () => {
    setMfaToken(null)
  }

  const handleGoogleLogin = () => {
    // Implement Google OAuth login
    window.location.href = '/api/auth/google'
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom textAlign="center">
        Sign In
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
        Welcome back! Please sign in to your account.
      </Typography>

      {error && !mfaRequired && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Email Address"
              type="email"
              autoComplete="email"
              error={!!errors.email}
              helperText={errors.email?.message}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              error={!!errors.password}
              helperText={errors.password?.message}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />
          )}
        />

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Controller
            name="rememberMe"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox {...field} checked={field.value} />}
                label="Remember me"
              />
            )}
          />
          <Link
            component={RouterLink}
            to="/forgot-password"
            variant="body2"
            color="primary"
          >
            Forgot password?
          </Link>
        </Box>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={isLoading}
          sx={{ mb: 2 }}
        >
          {isLoading ? <LoadingSpinner size={24} /> : 'Sign In'}
        </Button>

        <Divider sx={{ my: 2 }}>
          <Typography variant="body2" color="text.secondary">
            OR
          </Typography>
        </Divider>

        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={handleGoogleLogin}
          sx={{ mb: 3 }}
        >
          Continue with Google
        </Button>

        <Box textAlign="center">
          <Typography variant="body2" color="text.secondary">
            Don't have an account?{' '}
            <Link
              component={RouterLink}
              to="/register"
              color="primary"
              fontWeight="medium"
            >
              Sign up
            </Link>
          </Typography>
        </Box>
      </Box>

      {mfaToken && (
        <MFADialog
          open={!!mfaToken}
          token={mfaToken}
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
        />
      )}
    </Box>
  )
}

export default LoginPage