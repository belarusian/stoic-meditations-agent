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
 * Determine if an agent response indicates the conversation is finished.
 * The agent ends messages with AWAITING_USER_INPUT or COMPLETED.
 * COMPLETED without AWAITING_USER_INPUT means the conversation is done.
 */
export function isConversationFinished(response: string): boolean {
  return response.includes('COMPLETED') && !response.includes('AWAITING_USER_INPUT');
}

/**
 * Clean and format agent text: strip control markers.
 */
export function renderText(text: string): string {
  return text.trim().replace(/(?:^|\n)\s*(AWAITING_USER_INPUT|COMPLETED)\s*$/gi, '');
}

/**
 * Process a single A2A event stream into a response string.
 * Handles deduplication of final states via messageId.
 *
 * @returns object with { response, contextId, taskId, finished }
 */
export async function processEventStream(
  stream: AsyncGenerator<StreamEvent, void, unknown>,
  onStatusUpdate?: (text: string) => void,
  onPartialResponse?: (text: string) => void,
): Promise<{
  response: string;
  contextId: string | null;
  taskId: string | null;
  finished: boolean;
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

  const finished = isConversationFinished(response);
  return { response, contextId, taskId, finished };
}

export async function connectToAgent(url: string): Promise<ClientState> {
  const factory = new ClientFactory();
  const client = await factory.createFromUrl(url);
  return { client, contextId: null, taskId: null };
}
