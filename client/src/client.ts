import { ClientFactory } from '@a2a-js/sdk/client';

// Type for the A2A stream events (Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent)
type StreamEvent = any;

export interface ClientState {
  client: Awaited<ReturnType<typeof ClientFactory.prototype.createFromUrl>> | null;
  contextId: string | null;
  taskId: string | null;
}

export interface ConversationCallbacks {
  onStatusUpdate?: (text: string) => void;
  onPartialResponse?: (text: string) => void;
  onComplete?: (response: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Extract text from an A2A stream event.
 */
export function extractTextFromEvent(event: StreamEvent): string {
  if (event.kind === 'status-update' && event.status?.message) {
    return event.status.message.parts
      .map((p: any) => p.text || '')
      .join('\n');
  }
  if (event.kind === 'message') {
    return event.parts.map((p: any) => p.text || '').join('\n');
  }
  if (event.kind === 'task' && event.status?.message) {
    return event.status.message.parts
      .map((p: any) => p.text || '')
      .join('\n');
  }
  return '';
}

/**
 * Clean and format agent text: strip control markers.
 * NOTE: This module does NOT include markdown rendering.
 * The browser app should import `marked` separately and call
 * marked.parse(renderText(text)) for proper formatting.
 */
export function renderText(text: string): string {
  return text.trim().replace(/(?:^|\n)\s*(AWAITING_USER_INPUT|COMPLETED)\s*$/gi, '');
}

/**
 * Process a single A2A event stream into a response string.
 * Handles deduplication of final states via messageId.
 *
 * NOTE: This function does NOT reset taskId or stop listening for events.
 * The A2A task stays alive so the agent always has full conversation history.
 * The agent's AWAITING_USER_INPUT / COMPLETED markers are prompt instructions
 * for the agent itself — they do NOT control the task lifecycle.
 *
 * @returns object with { response, contextId, taskId }
 */
export async function processEventStream(
  stream: AsyncGenerator<StreamEvent, void, unknown>,
  onStatusUpdate?: (text: string) => void,
  onPartialResponse?: (text: string) => void,
): Promise<{
  response: string;
  contextId: string | null;
  taskId: string | null;
}> {
  let response = '';
  let lastFinalState: string | null = null;
  let contextId: string | null = null;
  let taskId: string | null = null;

  for await (const event of stream) {
    if (event.kind === 'status-update') {
      if (event.status?.state === 'working' && event.status.message) {
        const workingText = event.status.message.parts[0]?.text || '';
        if (workingText) {
          onStatusUpdate?.(workingText);
        }
      }

      // Deduplicate final states by messageId to avoid capturing duplicates
      if (event.final && event.status?.message && event.status.message.messageId !== lastFinalState) {
        lastFinalState = event.status.message.messageId;
        const text = extractTextFromEvent(event);
        if (text) {
          response = text;
        }
      }
    } else {
      const text = extractTextFromEvent(event);
      if (text) {
        response = text;
      }
    }

    if (event.contextId) contextId = event.contextId;
    if (event.taskId) taskId = event.taskId;

    if (response) {
      onPartialResponse?.(response);
    }
  }

  return { response, contextId, taskId };
}

export async function connectToAgent(url: string): Promise<ClientState> {
  const factory = new ClientFactory();
  const client = await factory.createFromUrl(url);
  return { client, contextId: null, taskId: null };
}

/**
 * Check if the agent explicitly ended the conversation.
 * If so, the A2A SDK locks the task. The next message needs a fresh task.
 */
export function isConversationFinished(response: string): boolean {
  return response.includes('COMPLETED') && !response.includes('AWAITING_USER_INPUT');
}
