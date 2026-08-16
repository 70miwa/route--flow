import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, UserPlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authApi, ApiError } from '../lib/api'

type Mode = 'login' | 'signup' | 'request-reset' | 'reset'

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, signup } = useAuth()
  const initialToken = new URLSearchParams(window.location.search).get('resetToken') || ''
  const [mode, setMode] = useState<Mode>(initialToken ? 'reset' : 'login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [token, setToken] = useState(initialToken)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function changeMode(next: Mode) {
    setMode(next)
    setError('')
    setMessage('')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        onClose()
      } else if (mode === 'signup') {
        await signup(username, email, password)
        onClose()
      } else if (mode === 'request-reset') {
        const response = await authApi.requestReset(email)
        setMessage(response.message)
        if (response.devToken) {
          setToken(response.devToken)
          setMode('reset')
          setMessage('Development token loaded. Choose a new password.')
        }
      } else {
        const response = await authApi.resetPassword(token, password)
        setMessage(response.message)
        setPassword('')
        setToken('')
        window.history.replaceState({}, '', window.location.pathname)
        setMode('login')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'login'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'request-reset'
          ? 'Reset password'
          : 'Choose a new password'

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          {(mode === 'request-reset' || mode === 'reset') && (
            <button className="icon-button" title="Back to sign in" onClick={() => changeMode('login')}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 id="auth-title">{title}</h2>
          <button className="icon-button ml-auto" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              <span>Username</span>
              <input
                className="field"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
          )}

          {mode !== 'reset' && (
            <label>
              <span>Email</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
          )}

          {mode === 'reset' && (
            <label>
              <span>Reset token</span>
              <input
                className="field font-mono text-xs"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </label>
          )}

          {mode !== 'request-reset' && (
            <label>
              <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
              <div className="password-field">
                <input
                  className="field"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'login' ? 1 : 8}
                  required
                />
                <button
                  type="button"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-message">{message}</p>}

          <button className="button button-primary w-full" type="submit" disabled={busy}>
            {mode === 'login' ? <LogIn size={17} /> : mode === 'signup' ? <UserPlus size={17} /> : <KeyRound size={17} />}
            {busy
              ? 'Working...'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'request-reset'
                    ? 'Send reset token'
                    : 'Update password'}
          </button>
        </form>

        {mode === 'login' && (
          <div className="auth-links">
            <button onClick={() => changeMode('request-reset')}>Forgot password?</button>
            <button onClick={() => changeMode('signup')}>Create an account</button>
          </div>
        )}
        {mode === 'signup' && (
          <div className="auth-links">
            <button onClick={() => changeMode('login')}>Already have an account? Sign in</button>
          </div>
        )}
      </section>
    </div>
  )
}
