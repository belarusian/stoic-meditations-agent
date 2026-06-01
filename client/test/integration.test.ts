import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'path';
import { ClientFactory } from '@a2a-js/sdk/client';

describe('Streaming conversation preserves task lifecycle', () => {
  const PORT = 41243;
  const clientUrl = `http://localhost:${PORT}`;
  const rootDir = resolve(__dirname, '../..');
  let serverProcess: ReturnType<typeof spawn> | null = null;

  beforeAll(async () => {
    const { execa } = await import('execa');
    await execa('npx', ['tsc'], { cwd: rootDir, stdio: 'pipe' });

    serverProcess = spawn('node', ['dist/agent.js'], {
      env: {
        ...process.env,
        STOIC_AGENT_PORT: String(PORT),
        LLM_BASE_URL: process.env.LLM_BASE_URL || 'http://10.106.1.182:8888/v1',
        LLM_API_KEY: process.env.LLM_API_KEY || '',
      },
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/.well-known/agent-card.json`);
        if (res.ok) { ready = true; break; }
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    expect(ready).toBe(true);
  }, 60000);

  afterAll(() => {
    serverProcess?.kill();
  });

  /**
   * Simulates exactly what the browser client does:
   * 1. Sends first message via sendMessageStream
   * 2. Captures taskId from events
   * 3. Sends second message with taskId
   * 4. Verifies no "Task in terminal state" crash
   */
  async function streamingSendMessage(client: Awaited<ReturnType<typeof ClientFactory.prototype.createFromUrl>>, text: string, taskId: string | null): Promise<{ response: string; capturedTaskId: string | null }> {
    const userMessage: any = {
      kind: 'message' as const,
      messageId: crypto.randomUUID(),
      role: 'user',
      parts: [{ kind: 'text', text }],
    };
    if (taskId) userMessage.taskId = taskId;

    const stream = client.sendMessageStream({ message: userMessage });
    let response = '';
    let capturedTaskId: string | null = null;

    for await (const event of stream) {
      if (event.kind === 'status-update' && event.status?.message && event.final) {
        const t = event.status.message.parts.map((p: any) => p.text || '').join('\n');
        if (t) response = t;
      } else if (event.kind === 'message') {
        const t = event.parts.map((p: any) => p.text || '').join('\n');
        if (t) response = t;
      }
      if (event.kind === 'task') {
        capturedTaskId = (event as any).id || capturedTaskId;
      }
      if ((event as any).taskId) capturedTaskId = (event as any).taskId;
    }

    return { response, capturedTaskId };
  }

  it('should capture taskId from first stream and reuse it on second message without crashing', async () => {
    const factory = new ClientFactory();
    const client = await factory.createFromUrl(clientUrl);

    // First message — no taskId
    const first = await streamingSendMessage(client, 'What is courage?', null);
    expect(first.response.length).toBeGreaterThan(0);
    expect(first.capturedTaskId).not.toBeNull();

    // Second message — WITH taskId (this is what the browser does)
    // If the SDK client doesn't properly pass taskId, this creates a new task.
    // If the agent ended the first task with COMPLETED, the second message
    // using the same taskId would crash with "Task in terminal state".
    const second = await streamingSendMessage(client, 'Elaborate on that.', first.capturedTaskId!);
    expect(second.response.length).toBeGreaterThan(0);

    // The agent should still be in context — not revert to initial greeting
    expect(second.response).not.toContain('I understand my role');
  }, 60000);

  it('should not crash when agent finishes with COMPLETED', async () => {
    // If the agent says COMPLETED, the SDK locks the task.
    // Sending another message with the same taskId crashes.
    // The client must detect COMPLETED and create a fresh task.
    const factory = new ClientFactory();
    const client = await factory.createFromUrl(clientUrl);

    const first = await streamingSendMessage(client, 'What is courage?', null);
    expect(first.response.length).toBeGreaterThan(0);

    // Agent will likely end with COMPLETED. Next message with same taskId crashes.
    // Without the fix, this throws "Task in terminal state".
    // With the fix, the client resets taskId and creates a new task.
    const second = await streamingSendMessage(client, 'Elaborate.', first.capturedTaskId!);
    expect(second.response.length).toBeGreaterThan(0);
  }, 60000);
});
