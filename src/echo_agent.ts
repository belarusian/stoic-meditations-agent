import express from "express";
import cors from "cors";

import {
  AgentCard,
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

/**
 * Simple echo agent for testing conversation history.
 *
 * No RAG, no LLM. It simply:
 * 1. Echoes back the conversation history so far
 * 2. Returns COMPLETED when told to stop
 *
 * This lets us verify whether the A2A server + client correctly
 * preserve task history across messages, independent of any model behavior.
 */
class SimpleAgentExecutor implements AgentExecutor {
  cancelTask = async (): Promise<void> => {};

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const existingTask = requestContext.task;

    const taskId = existingTask?.id || crypto.randomUUID();
    const contextId = userMessage.contextId || existingTask?.contextId || crypto.randomUUID();

    // Publish initial Task
    if (!existingTask) {
      eventBus.publish({
        kind: 'task',
        id: taskId,
        contextId,
        status: { state: "submitted", timestamp: new Date().toISOString() },
        history: [userMessage],
      } as any);
    }

    // Publish "working" status
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: "working",
        message: {
          kind: 'message',
          role: 'agent',
          messageId: crypto.randomUUID(),
          parts: [{ kind: 'text', text: 'Processing...' }],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    } as any);

    // Build full history
    let history: Message[] = existingTask?.history
      ? existingTask.history.filter(m => m.messageId !== userMessage.messageId)
      : [];
    history.push(userMessage);

    // Echo the full conversation back
    const historyText = history
      .map((m, i) => `${i + 1}. [${m.role}]: ${(m.parts as TextPart[]).find(p => p.kind === 'text')?.text || ''}`)
      .join('\n\n');

     const userText = userMessage.parts
      .map((p: any) => p.text || '')
      .join('\n');

    const isStop = userText.toLowerCase().includes('stop') || userText.toLowerCase().includes('done');

    const agentText = isStop
      ? `Here is the conversation so far:\n\n${historyText}\n\nCOMPLETED`
      : `Here is the conversation so far:\n\n${historyText}\n\nAWAITING_USER_INPUT`;

    // Publish final response
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: isStop ? "completed" : "input-required",
        message: {
          kind: 'message',
          role: 'agent',
          messageId: crypto.randomUUID(),
          parts: [{ kind: 'text', text: agentText }],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: true,
    } as any);
  }
}

const agentCard: AgentCard = {
  name: 'Echo Agent',
  description: 'A simple echo agent that remembers everything. No RAG, no LLM. For testing conversation history.',
  url: 'http://localhost:41244/',
  protocolVersion: '1.0',
  provider: {
    organization: 'Stoic What If Cards',
    url: 'https://github.com/belarusian/stoic-what-if-cards',
  },
  version: '1.0.0',
  capabilities: {
    streaming: true,
  },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'echo',
      name: 'Echo',
      description: 'Echoes back conversation history.',
      tags: ['test', 'echo'],
      examples: ['Tell me what I said earlier', 'Stop'],
    },
  ],
};

async function main() {
  const taskStore: TaskStore = new InMemoryTaskStore();
  const agentExecutor: AgentExecutor = new SimpleAgentExecutor();
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, agentExecutor);

  const expressApp = express();
  expressApp.use(cors());

  const appBuilder = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
  const a2aApp = appBuilder.setupRoutes(expressApp);
  expressApp.use("/api/rest", restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  const PORT = 41244;
  a2aApp.listen(PORT, () => {
    console.log(`[Echo Agent] Running on http://localhost:${PORT}`);
    console.log(`[Echo Agent] Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
  });
}

main().catch(console.error);
