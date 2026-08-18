import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface BookmarkletPanelProps {
  providerId: string
  providerType: string
  providerName?: string
  loginUrl: string
  onSuccess: (
    credentials: Record<string, string>,
    accountInfo?: { name?: string; email?: string },
  ) => void
}

type Phase = 'idle' | 'issuing' | 'waiting' | 'success' | 'error'

const POLL_INTERVAL_MS = 2000

export function BookmarkletPanel({
  providerId,
  providerType,
  providerName,
  loginUrl,
  onSuccess,
}: BookmarkletPanelProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [bookmarkletHref, setBookmarkletHref] = useState('')
  const [expectedOrigin, setExpectedOrigin] = useState('')
  const [error, setError] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ticketRef = useRef('')

  const displayName = providerName || providerType

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
      if (ticketRef.current) {
        void window.electronAPI?.oauth?.bookmarklet?.cancel(ticketRef.current).catch(() => undefined)
      }
    }
  }, [stopPolling])

  const startPolling = (ticketValue: string, expires: number) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      if (Date.now() > expires) {
        stopPolling()
        setError(t('oauth.bookmarklet.expired'))
        setPhase('error')
        return
      }

      try {
        const res = await window.electronAPI.oauth.bookmarklet.poll(ticketValue)
        if (res.state === 'completed') {
          stopPolling()
          ticketRef.current = ''
          const result = res.result
          if (result?.success && result.credentials) {
            setPhase('success')
            onSuccess(result.credentials, result.accountInfo)
          } else {
            setError(result?.error || t('oauth.bookmarklet.tokenInvalid'))
            setPhase('error')
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (message.includes('Ticket')) {
          stopPolling()
          setError(t('oauth.bookmarklet.ticketUsed'))
          setPhase('error')
        }
      }
    }, POLL_INTERVAL_MS)
  }

  const issueTicket = async () => {
    setPhase('issuing')
    setError('')
    try {
      const data = await window.electronAPI.oauth.bookmarklet.issue(providerId, providerType)
      setBookmarkletHref(data.bookmarklet.href)
      setExpectedOrigin(data.bookmarklet.expectedOrigin || '')
      setExpiresAt(data.expiresAt)
      ticketRef.current = data.ticket
      setPhase('waiting')
      startPolling(data.ticket, data.expiresAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('oauth.bookmarklet.networkError'))
      setPhase('error')
    }
  }

  const timeLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))

  if (phase === 'idle' || phase === 'issuing') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('oauth.bookmarklet.description', { provider: displayName })}
        </p>
        {providerType === 'deepseek' && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
            {t('oauth.bookmarklet.deepseekUserTokenNotice')}
          </p>
        )}
        <Button type="button" onClick={() => void issueTicket()} disabled={phase === 'issuing'} className="w-full">
          {phase === 'issuing' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('oauth.bookmarklet.generating')}
            </>
          ) : (
            <>
              <Bookmark className="mr-2 h-4 w-4" />
              {t('oauth.bookmarklet.generate')}
            </>
          )}
        </Button>
      </div>
    )
  }

  if (phase === 'waiting') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-2">{t('oauth.bookmarklet.dragHint')}</p>
          <a
            href={bookmarkletHref}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 cursor-grab active:cursor-grabbing"
            onClick={(event) => {
              event.preventDefault()
              alert(t('oauth.bookmarklet.clickWarning', { provider: displayName }))
            }}
          >
            <Bookmark className="h-4 w-4" />
            {t('oauth.bookmarklet.dragButton')}
          </a>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
          <li>{t('oauth.bookmarklet.instructions.drag')}</li>
          {providerType === 'deepseek' && <li>{t('oauth.bookmarklet.instructions.externalBrowser')}</li>}
          <li>{t('oauth.bookmarklet.instructions.open')}</li>
          <li>
            {t('oauth.bookmarklet.instructions.click')}{' '}
            <code className="font-mono bg-background px-1 py-0.5 rounded border text-[10px]">
              {expectedOrigin || loginUrl}
            </code>
          </li>
          <li>{t('oauth.bookmarklet.instructions.wait')}</li>
        </ol>
        <Button
          type="button"
          onClick={() => window.open(loginUrl, '_blank', 'noopener,noreferrer')}
          className="w-full"
          variant="outline"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('oauth.bookmarklet.openLogin', { host: safeHost(loginUrl) })}
        </Button>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('oauth.bookmarklet.waiting')}
          </span>
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} {t('oauth.bookmarklet.timeLeft')}
          </span>
        </div>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>{t('oauth.bookmarklet.success')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Button type="button" onClick={() => void issueTicket()} className="w-full" variant="outline">
        <Bookmark className="mr-2 h-4 w-4" />
        {t('oauth.bookmarklet.tryAgain')}
      </Button>
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default BookmarkletPanel
