import React, { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
} from '@mui/material'
import { Security as SecurityIcon } from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/store'
import { verifyMFA } from '@/store/slices/authSlice'
import LoadingSpinner from '@/components/common/LoadingSpinner'

interface MFADialogProps {
  open: boolean
  token: string
  onSuccess: () => void
  onCancel: () => void
}

const MFADialog: React.FC<MFADialogProps> = ({
  open,
  token,
  onSuccess,
  onCancel,
}) => {
  const dispatch = useAppDispatch()
  const { isLoading, error } = useAppSelector((state) => state.auth)
  
  const [code, setCode] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (open && inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [open])

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) return

    const newDigits = [...digits]
    newDigits[index] = value
    setDigits(newDigits)
    setCode(newDigits.join(''))

    // Auto-focus next input
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const newDigits = pastedData.split('').concat(Array(6).fill('')).slice(0, 6)
    setDigits(newDigits)
    setCode(newDigits.join(''))
  }

  const handleSubmit = async () => {
    if (code.length !== 6) return

    try {
      await dispatch(verifyMFA({ token, code })).unwrap()
      onSuccess()
    } catch (error) {
      // Error is handled by the store
    }
  }

  const handleClose = () => {
    setCode('')
    setDigits(['', '', '', '', '', ''])
    onCancel()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <SecurityIcon color="primary" />
          <Typography variant="h6">Two-Factor Authentication</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Please enter the 6-digit code from your authenticator app.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          display="flex"
          gap={1}
          justifyContent="center"
          mb={3}
          onPaste={handlePaste}
        >
          {digits.map((digit, index) => (
            <TextField
              key={index}
              inputRef={(el) => (inputRefs.current[index] = el)}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              inputProps={{
                maxLength: 1,
                style: {
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                },
              }}
              sx={{
                width: 56,
                '& .MuiOutlinedInput-root': {
                  height: 56,
                },
              }}
            />
          ))}
        </Box>

        <Typography variant="body2" color="text.secondary" textAlign="center">
          Can't access your authenticator app?{' '}
          <Button variant="text" size="small">
            Use backup code
          </Button>
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={code.length !== 6 || isLoading}
        >
          {isLoading ? <LoadingSpinner size={20} /> : 'Verify'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default MFADialog