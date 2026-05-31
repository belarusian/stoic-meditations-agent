import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { ClientFactory } from '@a2a-js/sdk/client';
import { join } from 'path';

describe('Conversation history', () => {
  const PORT = 41243;
  const clientUrl = `http://localhost:${PORT}`;
  let serverProcess: ReturnType<typeof spawn> | null = null;

  beforeAll(async () => {
    // Build the TypeScript first
    const { execa } = await import('execa');
    await execa('npx', ['tsc'], { cwd: process.cwd() });

    // Start the agent server on a different port
    serverProcess = spawn('node', ['dist/agent.js'], {
      env: {
        ...process.env,
        STOIC_AGENT_PORT: String(PORT),
        LLM_BASE_URL: process.env.LLM_BASE_URL || 'http://10.106.1.182:8888/v1',
        LLM_API_KEY: process.env.LLM_API_KEY || '',
      },
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/.well-known/agent-card.json`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    expect(ready).toBe(true);
  }, 60000);

  afterAll(() => {
    serverProcess?.kill();
  });

  async function sendMessage(client: Awaited<ReturnType<typeof ClientFactory.prototype.createFromUrl>>, text: string) {
    const result = await client.sendMessage({
      message: {
        kind: 'message' as const,
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{ kind: 'text', text }],
      },
    });
    if (result.kind === 'message') {
      return result.parts.map((p: any) => p.text || '').join('\n');
    }
    if (result.status?.message) {
      return result.status.message.parts.map((p: any) => p.text || '').join('\n');
    }
    throw new Error(`Unexpected result type: ${result.kind}`);
  }

  it('should preserve conversation context across multiple messages', async () => {
    const factory = new ClientFactory();
    const client = await factory.createFromUrl(clientUrl);

    const firstReply = await sendMessage(client, 'What is courage according to Stoicism?');
    expect(firstReply.length).toBeGreaterThan(0);

    const secondReply = await sendMessage(client, 'You just asked about courage — can you elaborate on that?');
    expect(secondReply.length).toBeGreaterThan(0);

    const textLower = secondReply.toLowerCase();
    expect(textLower).toContain('courage');
  }, 60000);
});
