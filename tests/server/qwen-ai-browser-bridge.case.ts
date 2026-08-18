import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { QwenAiBrowserBridgeManager } from '../../backend/providers/qwen-ai/browserBridge.ts'

test('Qwen AI browser bridge forwards only safe same-origin request data and streams bytes back', async () => {
  const manager = new QwenAiBrowserBridgeManager()
  const registration = manager.register('account-jwt')
  const pollPromise = manager.poll(registration.bridgeToken)
  const responsePromise = manager.execute(
    'account-jwt',
    'https://chat.qwen.ai/api/v2/chat/completions?chat_id=chat-1',
    '{"stream":true}',
    {
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Version: '0.2.86',
        source: 'desktop',
        Authorization: 'Bearer secret',
        Cookie: 'token=secret',
      },
    },
  )

  const task = await pollPromise
  assert.ok(task)
  assert.equal(task.path, '/api/v2/chat/completions?chat_id=chat-1')
  assert.equal(task.headers.source, 'web')
  assert.equal(task.headers.Version, '0.2.86')
  assert.equal(task.headers.Authorization, undefined)
  assert.equal(task.headers.Cookie, undefined)

  assert.equal(manager.handleEvent(registration.bridgeToken, {
    taskId: task.id,
    type: 'start',
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  }), true)
  const response = await responsePromise
  const ended = once(response.data, 'end')
  let received = ''
  response.data.on('data', (chunk: Buffer) => {
    received += chunk.toString('utf8')
  })

  manager.handleEvent(registration.bridgeToken, {
    taskId: task.id,
    type: 'chunk',
    data: Buffer.from('data: {"ok":true}\n\n').toString('base64'),
  })
  manager.handleEvent(registration.bridgeToken, { taskId: task.id, type: 'end' })
  await ended

  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'text/event-stream')
  assert.equal(received, 'data: {"ok":true}\n\n')
})

test('Qwen AI browser bridge is optional for accounts without a connected page', async () => {
  const manager = new QwenAiBrowserBridgeManager()
  const response = await manager.execute(
    'unpaired-jwt',
    'https://chat.qwen.ai/api/v2/chat/completions?chat_id=chat-1',
    '{}',
    { headers: {} },
  )
  assert.equal(response, undefined)
})

