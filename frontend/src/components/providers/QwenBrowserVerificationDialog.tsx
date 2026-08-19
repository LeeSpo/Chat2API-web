import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Account } from '@/types/electron'

type BrowserStatus = Awaited<ReturnType<typeof window.electronAPI.qwenAiBrowser.status>>

interface Props {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
  providerId?: 'qwen-ai' | 'zai'
}

type CapturedPoint = { x: number; y: number; delayMs: number; at: number }

function browserApi(providerId: 'qwen-ai' | 'zai') {
  return providerId === 'zai'
    ? window.electronAPI.zaiBrowser
    : window.electronAPI.qwenAiBrowser
}

export function QwenBrowserVerificationDialog({
  account,
  open,
  onOpenChange,
  providerId = 'qwen-ai',
}: Props) {
  const api = browserApi(providerId)
  const isZai = providerId === 'zai'
  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pointsRef = useRef<CapturedPoint[]>([])
  const draggingRef = useRef(false)

  const replaceImage = (blob: Blob) => {
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(blob)
    })
  }

  const refreshScreenshot = async () => {
    if (!account) return
    const blob = await api.screenshot(account.id)
    replaceImage(blob)
  }

  const start = async () => {
    if (!account) return
    setBusy(true)
    setError('')
    try {
      const next = await api.start(account.id)
      setStatus(next)
      await refreshScreenshot()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open && account) void start()
  }, [open, account?.id])

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const capturePoint = (
    event: React.PointerEvent<HTMLImageElement>,
    previous?: CapturedPoint,
  ): CapturedPoint | undefined => {
    if (!status) return undefined
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return undefined
    const at = performance.now()
    return {
      x: ((event.clientX - rect.left) / rect.width) * status.viewport.width,
      y: ((event.clientY - rect.top) / rect.height) * status.viewport.height,
      delayMs: previous ? Math.min(100, Math.max(0, Math.round(at - previous.at))) : 0,
      at,
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    const point = capturePoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    pointsRef.current = [point]
  }

  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!draggingRef.current) return
    const points = pointsRef.current
    const previous = points[points.length - 1]
    const point = capturePoint(event, previous)
    if (!point) return
    if (points.length < 500) pointsRef.current = [...points, point]
  }

  const onPointerUp = async (event: React.PointerEvent<HTMLImageElement>) => {
    if (!account || !draggingRef.current) return
    draggingRef.current = false
    const points = pointsRef.current
    const finalPoint = capturePoint(event, points[points.length - 1])
    if (finalPoint && points.length < 500) points.push(finalPoint)
    if (points.length < 2) return

    setBusy(true)
    setError('')
    try {
      const next = await api.drag(
        account.id,
        points.map(({ x, y, delayMs }) => ({ x, y, delayMs })),
      )
      setStatus(next)
      await refreshScreenshot()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
      pointsRef.current = []
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[1000px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {isZai ? 'Z.ai server browser verification' : 'Qwen server browser verification'}
          </DialogTitle>
          <DialogDescription>
            {isZai
              ? '下方是 Docker 里无头 Chrome 的截图。若出现「点击开始验证」或滑块，请直接在图上拖动；完成后关闭对话框再重试 API。'
              : 'This Chromium session runs inside Docker without a visible window. If Qwen shows a puzzle, drag it directly in the image below; the verified profile is persisted in the data volume.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status && !status.available && (
          <Alert variant="destructive">
            <AlertDescription>{status.lastError || 'Chromium is unavailable.'}</AlertDescription>
          </Alert>
        )}

        {status?.available && status.verificationRequired && (
          <Alert>
            <AlertDescription>
              {isZai
                ? (status.lastError || '请在截图中完成验证。如果是空白页，先点「刷新验证」。')
                : 'Drag the puzzle in the screenshot if one is visible.'}
            </AlertDescription>
          </Alert>
        )}

        {status?.available && !status.verificationRequired && (
          <Alert>
            <AlertDescription>
              {isZai
                ? '浏览器验证已完成，可以关闭此窗口并重新发送对话请求。'
                : 'Server browser is ready. You may close this dialog and retry the API request.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="relative overflow-hidden rounded-md border bg-muted min-h-64">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Qwen server browser"
              draggable={false}
              className="block w-full select-none touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => void onPointerUp(event)}
              onPointerCancel={() => { draggingRef.current = false }}
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Initializing Chromium…
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void start()} disabled={busy || !account}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh verification
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
