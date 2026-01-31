import React, { useState, useEffect } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  InputAdornment,
  IconButton,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Stepper,
  Step,
  StepLabel,
  Divider,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Email as EmailIcon,
  Lock as LockIcon,
  Person as PersonIcon,
  Google as GoogleIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { toast } from 'react-toastify'

import { useAppDispatch, useAppSelector } from '@/store'
import { register, clearError } from '@/store/slices/authSlice'
import { RegisterData } from '@/types'
import LoadingSpinner from '@/components/common/LoadingSpinner'

const schema = yup.object({
  firstName: yup
    .string()
    .min(2, 'First name must be at least 2 characters')
    .required('First name is required'),
  lastName: yup
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .required('Last name is required'),
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    )
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  role: yup
    .string()
    .oneOf(['MENTOR', 'STUDENT'], 'Please select a role')
    .required('Role is required'),
  acceptTerms: yup
    .boolean()
    .oneOf([true], 'You must accept the terms and conditions')
    .required('You must accept the terms and conditions'),
})

const steps = ['Account Details', 'Role Selection', 'Verification']

const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const { isLoading, error } = useAppSelector((state) => state.auth)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [activeStep, setActiveStep] = useState(0)

  const {
    control,
    handleSubmit,
    formState: { errors },
    trigger,
    getValues,
  } = useForm<RegisterData>({
    resolver: yupResolver(schema),
    mode: 'onChange',
    shouldUnregister: false, // Keep values when fields unmount
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'STUDENT',
      acceptTerms: false,
    },
  })

  useEffect(() => {
    dispatch(clearError())
  }, [dispatch])

  const onSubmit = async (data: RegisterData) => {
    alert('Inside onSubmit! Submitting data...') // DEBUG
    console.log('Inside onSubmit', data)
    try {
      await dispatch(register(data)).unwrap()
      toast.success('Registration successful! Please check your email to verify your account.')
      navigate('/verify-email')
    } catch (error: any) {
      console.error('Submit error:', error)
      alert('Registration error: ' + error) // DEBUG
      toast.error(error || 'Registration failed')
    }
  }



  const handleNext = async () => {
    alert('Button clicked! Step: ' + activeStep)  // DEBUG: Remove after testing
    let fieldsToValidate: (keyof RegisterData)[] = []

    switch (activeStep) {
      case 0:
        fieldsToValidate = ['firstName', 'lastName', 'email']
        break
      case 1:
        fieldsToValidate = ['password', 'confirmPassword', 'role']
        break
      case 2:
        fieldsToValidate = ['acceptTerms']
        break
    }

    alert('About to validate: ' + fieldsToValidate.join(', '))  // DEBUG
    console.log('Validating fields:', fieldsToValidate, 'on step:', activeStep)
    const isStepValid = await trigger(fieldsToValidate)
    alert('Validation result: ' + isStepValid)  // DEBUG
    console.log('Validation result:', isStepValid, 'Errors:', errors)

    if (isStepValid) {
      if (activeStep === steps.length - 1) {
        alert('Form is valid! Submitting directly...')  // DEBUG
        console.log('Submitting form directly...')
        const formData = getValues()
        // Check manually for term acceptance (just in case trigger missed it)
        if (!formData.acceptTerms) {
          alert('Terms not accepted!')
          return
        }
        onSubmit(formData)
      } else {
        setActiveStep((prevStep) => prevStep + 1)
      }
    } else {
      alert('Validation failed! Check errors.')  // DEBUG
      // Show first error as toast for user feedback
      const firstError = Object.values(errors).find(err => err?.message)
      if (firstError?.message) {
        toast.error(firstError.message)
      }
    }
  }

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1)
  }

  const handleGoogleRegister = () => {
    window.location.href = '/api/auth/google?action=register'
  }

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Personal Information
            </Typography>
            <Box display="flex" gap={2} mb={2}>
              <Controller
                name="firstName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="First Name"
                    error={!!errors.firstName}
                    helperText={errors.firstName?.message}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
              />
              <Controller
                name="lastName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Last Name"
                    error={!!errors.lastName}
                    helperText={errors.lastName?.message}
                  />
                )}
              />
            </Box>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Email Address"
                  type="email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />
          </Box>
        )

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Account Security & Role
            </Typography>
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
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
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Confirm Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  error={!!errors.confirmPassword}
                  helperText={errors.confirmPassword?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          edge="end"
                        >
                          {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 3 }}
                />
              )}
            />
            <FormControl component="fieldset" error={!!errors.role}>
              <FormLabel component="legend">I want to join as a:</FormLabel>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <RadioGroup {...field} row sx={{ mt: 1 }}>
                    <FormControlLabel
                      value="STUDENT"
                      control={<Radio />}
                      label="Student - Looking for mentorship"
                    />
                    <FormControlLabel
                      value="MENTOR"
                      control={<Radio />}
                      label="Mentor - Offering guidance"
                    />
                  </RadioGroup>
                )}
              />
            </FormControl>
          </Box>
        )

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Terms & Conditions
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Please review and accept our terms to complete your registration.
            </Typography>
            <Controller
              name="acceptTerms"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      {...field}
                      checked={field.value}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      I agree to the{' '}
                      <Link href="/terms" target="_blank" color="primary">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" target="_blank" color="primary">
                        Privacy Policy
                      </Link>
                    </Typography>
                  }
                />
              )}
            />
            {errors.acceptTerms && (
              <Typography variant="caption" color="error" display="block" mt={1}>
                {errors.acceptTerms.message}
              </Typography>
            )}
          </Box>
        )

      default:
        return null
    }
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom textAlign="center">
        Create Account
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
        Join our community of mentors and students
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" noValidate>
        <Box sx={{ display: activeStep === 0 ? 'block' : 'none' }}>
          {renderStepContent(0)}
        </Box>
        <Box sx={{ display: activeStep === 1 ? 'block' : 'none' }}>
          {renderStepContent(1)}
        </Box>
        <Box sx={{ display: activeStep === 2 ? 'block' : 'none' }}>
          {renderStepContent(2)}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 3 }}>
          <Button
            color="inherit"
            disabled={activeStep === 0}
            onClick={handleBack}
            sx={{ mr: 1 }}
          >
            Back
          </Button>
          <Box sx={{ flex: '1 1 auto' }} />
          <Button
            onClick={handleNext}
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? (
              <LoadingSpinner size={24} />
            ) : activeStep === steps.length - 1 ? (
              'Create Account'
            ) : (
              'Next'
            )}
          </Button>
        </Box>
      </Box>

      {activeStep === 0 && (
        <>
          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Button
            fullWidth
            variant="outlined"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleRegister}
            sx={{ mb: 3 }}
          >
            Continue with Google
          </Button>
        </>
      )}

      <Box textAlign="center" mt={2}>
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Link
            component={RouterLink}
            to="/login"
            color="primary"
            fontWeight="medium"
          >
            Sign in
          </Link>
        </Typography>
      </Box>
    </Box>
  )
}

export default RegisterPage