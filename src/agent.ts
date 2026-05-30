import express from "express";
import { v4 as uuidv4 } from 'uuid';
import cors from "cors";

import {
  AgentCard,
  Task,
  TaskState,
  TaskStatusUpdateEvent,
  TextPart,
  Message,
} from "@a2a-js/sdk";
import {
  InMemoryTaskStore,
  TaskStore,
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  DefaultRequestHandler,
} from "@a2a-js/sdk/server";
import { UserBuilder } from "@a2a-js/sdk/server/express";
import { A2AExpressApp, restHandler } from "@a2a-js/sdk/server/express";
import { MessageData } from "genkit";
import { ai } from "./genkit.js";
import { initializeVectorStore, getMeditationContext } from "./rag.js";

// Load the Genkit prompt
const stoicAgentPrompt = ai.prompt('stoic_agent');

// Initialize vector store on startup (lazy initialization)
// This runs asynchronously, so agent can start before embeddings complete

// Configure embedding mode via environment variable:
// EMBEDDING_MODE=remote npm run build && node dist/agent.js
// REMOTE_EMBEDDING_URL=http://your-server:port npm run build && node dist/agent.js

import { getEmbeddingMode } from './rag.js';

initializeVectorStore().then(() => {
  console.log(`[Agent] RAG vector store initialized (mode: ${getEmbeddingMode()})`);
}).catch(err => {
  console.warn('[Agent] Failed to initialize RAG vector store:', err);
});

/**
 * StoicAgentExecutor implements the agent's core logic.
 * Uses the event bus pattern to publish state updates.
 */
class StoicAgentExecutor implements AgentExecutor {
  private cancelledTasks = new Set<string>();

  public cancelTask = async (
    taskId: string,
    _eventBus: ExecutionEventBus,
  ): Promise<void> => {
    this.cancelledTasks.add(taskId);
  };

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const existingTask = requestContext.task;

    const taskId = existingTask?.id || uuidv4();
    const contextId = userMessage.contextId || existingTask?.contextId || uuidv4();

    console.log(
      `[StoicAgentExecutor] Processing message ${userMessage.messageId} for task ${taskId} (context: ${contextId})`
    );

    // Publish initial Task event if it's a new task
    if (!existingTask) {
      const initialTask: Task = {
        kind: 'task',
        id: taskId,
        contextId: contextId,
        status: {
          state: "submitted",
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
        metadata: userMessage.metadata,
      };
      eventBus.publish(initialTask);
    }

    // Publish "working" status update
    const workingStatusUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId: taskId,
      contextId: contextId,
      status: {
        state: "working",
        message: {
          kind: 'message',
          role: 'agent',
          messageId: uuidv4(),
          parts: [{ kind: 'text', text: 'Consulting the Meditations...' }],
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    };
    eventBus.publish(workingStatusUpdate);

    // Prepare messages for Genkit prompt using existing task history if available
    let history: Message[] = [];
    if (existingTask?.history) {
      history = existingTask.history.filter(m => m.messageId !== userMessage.messageId);
    }
    history.push(userMessage);

    const messages: MessageData[] = history
      .map((m) => ({
        role: (m.role === 'agent' ? 'model' : 'user') as 'user' | 'model',
        content: m.parts
          .filter((p): p is TextPart => p.kind === 'text' && !!(p as TextPart).text)
          .map((p) => ({
            text: (p as TextPart).text,
          })),
      }))
      .filter((m) => m.content.length > 0);

    if (messages.length === 0) {
      console.warn(
        `[StoicAgentExecutor] No valid text messages found in history for task ${taskId}.`
      );
      const failureUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: taskId,
        contextId: contextId,
        status: {
          state: "failed",
          message: {
            kind: 'message',
            role: 'agent',
            messageId: uuidv4(),
            parts: [{ kind: 'text', text: 'No message found to process.' }],
            taskId: taskId,
            contextId: contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(failureUpdate);
      return;
    }

    try {
      // Get relevant meditations passages using RAG
      const lastUserMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const query = lastUserMessage?.content?.[0]?.text || '';
      const meditationsContext = await getMeditationContext(query, 3);
      
      console.log(`[RAG] Context length: ${meditationsContext.length} chars`);
      
      // Run the Genkit prompt with Meditations context
      const response = await stoicAgentPrompt(
        { 
          meditations: meditationsContext || 'Meditations context not available.'
        },
        {
          messages,
          // llama.cpp repetition / presence / frequency penalties
          // repeat_penalty: 1.0 = no effect, >1.0 discourages repetition
          // presence_penalty / frequency_penalty: penalize repeated tokens
          // compat-oai forwards unknown keys (restOfConfig) to the API body
          config: {
            repeat_penalty: 1.1,
            presence_penalty: 0.5,
            frequency_penalty: 0.5,
          } as any,
        }
      );

      if (this.cancelledTasks.has(taskId)) {
        console.log(`[StoicAgentExecutor] Request cancelled for task: ${taskId}`);
        const cancelledUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId: taskId,
          contextId: contextId,
          status: {
            state: "canceled",
            timestamp: new Date().toISOString(),
          },
          final: true,
        };
        eventBus.publish(cancelledUpdate);
        return;
      }

      const responseText = response.text;
      console.info(`[StoicAgentExecutor] Prompt response: ${responseText}`);
      const lines = responseText.trim().split('\n');
      const finalStateLine = lines.at(-1)?.trim().toUpperCase();
      const agentReplyText = lines.slice(0, lines.length - 1).join('\n').trim();

      let finalA2AState: TaskState = "completed";
      if (finalStateLine === 'COMPLETED') {
        finalA2AState = "completed";
      } else if (finalStateLine === 'AWAITING_USER_INPUT') {
        finalA2AState = "input-required";
      }

      // Publish final task status update
      const agentMessage: Message = {
        kind: 'message',
        role: 'agent',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text: agentReplyText || "Completed." }],
        taskId: taskId,
        contextId: contextId,
      };

      const finalUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: taskId,
        contextId: contextId,
        status: {
          state: finalA2AState,
          message: agentMessage,
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(finalUpdate);

      console.log(
        `[StoicAgentExecutor] Task ${taskId} finished with state: ${finalA2AState}`
      );

    } catch (error: any) {
      console.error(
        `[StoicAgentExecutor] Error processing task ${taskId}:`,
        error
      );
      const errorUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: taskId,
        contextId: contextId,
        status: {
          state: "failed",
          message: {
            kind: 'message',
            role: 'agent',
            messageId: uuidv4(),
            parts: [{ kind: 'text', text: `Agent error: ${error.message}` }],
            taskId: taskId,
            contextId: contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(errorUpdate);
    }
  }
}

// --- Server Setup ---

const stoicAgentCard: AgentCard = {
  name: 'Stoic Guide',
  description: 'A Stoic philosophy guide that reads Marcus Aurelius\' Meditations to help you reflect on present-moment challenges.',
  url: 'http://localhost:41242/',
  protocolVersion: '1.0',
  provider: {
    organization: 'Stoic What If Cards',
    url: 'https://github.com/belarusian/stoic-what-if-cards',
  },
  version: '1.0.0',
  capabilities: {
    streaming: true,
  },
  defaultInputModes: ['text', 'text/plain', 'application/json'],
  defaultOutputModes: ['text', 'text/plain', 'application/json'],
  additionalInterfaces: [
    { url: 'http://localhost:41242/', transport: 'JSONRPC' },
  ],
  skills: [
    {
      id: 'stoic_reflection',
      name: 'Stoic Reflection',
      description: 'Answer questions about Stoic philosophy using Marcus Aurelius\' Meditations as the authoritative source.',
      tags: ['stoicism', 'philosophy', 'reflection', 'virtue'],
      examples: [
        'What would Marcus say about dealing with anger?',
        'How should I respond if someone insults me?',
        'What does Stoicism say about loss and grief?',
      ],
    },
  ],
};

async function main() {
  const taskStore: TaskStore = new InMemoryTaskStore();
  const agentExecutor: AgentExecutor = new StoicAgentExecutor();
  const requestHandler = new DefaultRequestHandler(
    stoicAgentCard,
    taskStore,
    agentExecutor
  );

  const expressApp = express();

  // Enable CORS for all origins (development)
  expressApp.use(cors());

  const appBuilder = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
  const a2aApp = appBuilder.setupRoutes(expressApp);
  
  // Add REST handler for streaming support (POST /v1/message:stream)
  expressApp.use("/api/rest", restHandler({
    requestHandler: requestHandler,
    userBuilder: UserBuilder.noAuthentication
  }));

  const PORT = process.env.STOIC_AGENT_PORT || 41242;
  a2aApp.listen(PORT, () => {
    console.log(`[StoicAgent] Server started on http://localhost:${PORT}`);
    console.log(`[StoicAgent] Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
    console.log(`[StoicAgent] Web Interface: http://localhost:3000/index.html`);
    console.log('[StoicAgent] Press Ctrl+C to stop the server');
  });
}

main().catch(console.error);
