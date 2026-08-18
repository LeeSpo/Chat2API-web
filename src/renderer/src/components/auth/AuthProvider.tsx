import React, { useCallback, useEffect, useState } from 'react'
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import logoIcon from '@/assets/icons/icons.png'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Alert, AlertDescription } from '../ui/alert'
import {
  auth,
  clearManagementSecret,
  getStoredManagementSecret,
  setManagementSecret,
} from '@/web-admin-api'

type Phase = 'loading' | 'firstRun' | 'login' | 'authenticated' | 'offline'

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const probe = useCallback(async () => {
    setPhase('loading')
    setError('')
    try {
      const status = await auth.status()
      if (status.firstRun) {
        setPhase('firstRun')
        return
      }

      const cached = getStoredManagementSecret()
      if (cached) {
        const valid = await auth.verifyStoredSecret()
        if (valid) {
          setPhase('authenticated')
          return
        }
        clearManagementSecret()
      }
      setPhase('login')
    } catch (err) {
      setPhase('offline')
      setError(err instanceof Error ? err.message : 'Cannot reach the management API.')
    }
  }, [])

  useEffect(() => {
    void probe()
  }, [probe])

  useEffect(() => {
    const onUnauth = () => {
      setPhase('login')
      setError('Session expired, please sign in again.')
    }
    window.addEventListener('management-api-unauthorized', onUnauth)
    return () => window.removeEventListener('management-api-unauthorized', onUnauth)
  }, [])

  const handleFirstRun = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const { secret } = await auth.setup(password)
      setManagementSecret(secret)
      setPassword('')
      setConfirmPassword('')
      setPhase('authenticated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!password) {
      setError('Please enter your password.')
      return
    }
    setSubmitting(true)
    try {
      const { secret } = await auth.login(password)
      setManagementSecret(secret)
      setPassword('')
      setPhase('authenticated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'authenticated') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col items-center text-center space-y-3">
          <img src={logoIcon} alt="Chat2API" className="h-12 w-12 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold">
              {phase === 'firstRun' ? 'Welcome to Chat2API' : 'Chat2API'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'firstRun' && 'Create an administrator password to secure the web UI.'}
              {phase === 'login' && 'Sign in with your administrator password.'}
              {phase === 'loading' && 'Connecting to the backend service…'}
              {phase === 'offline' && 'The management API is not reachable right now.'}
            </p>
          </div>
        </div>

        {phase === 'loading' && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {phase === 'offline' && (
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button className="w-full" onClick={() => void probe()}>
              Retry
            </Button>
          </div>
        )}

        {phase === 'firstRun' && (
          <form onSubmit={handleFirstRun} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Create password and continue
                </>
              )}
            </Button>
          </form>
        )}

        {phase === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Sign in
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
