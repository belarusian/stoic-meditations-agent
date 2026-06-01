import express from "express";
import cors from "cors";

import {
  AgentCard,
  TextPart,
  Message,
  TaskState,
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
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  openAICompatible,
  compatOaiModelRef,
} from "@genkit-ai/compat-oai";
import { genkit } from "genkit";

// Read meditations text
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const meditationsPath = join(__dirname, "../meditations.mb.txt");
const meditationsText = readFileSync(meditationsPath, "utf-8");

// Define a reference to the local model
const llamaCppModel = compatOaiModelRef({
  name: "llama-cpp/qwen3-coder-next-q8",
});

// Create Genkit instance
export const ai = genkit({
  plugins: [
    openAICompatible({
      name: "llama-cpp",
      apiKey: process.env.LLM_API_KEY || "dummy",
      baseURL: process.env.LLM_BASE_URL || "http://10.106.1.89:8080/v1",
    }),
  ],
  model: llamaCppModel,
  promptDir: "./src",
});

// Load the Genkit prompt
const stoicAgentPrompt = ai.prompt('stoic_agent');

/**
 * Minimal Stoic agent: uses the real LLM + real Meditations text,
 * but NO RAG. The entire Meditations text is passed as context once,
 * not re-retrieved per message. This lets us test whether the prompt
 * + conversation history work correctly without RAG interference.
 */
class MinimalStoicAgentExecutor implements AgentExecutor {
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
          parts: [{ kind: 'text', text: 'Consulting the Meditations...' }],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    } as any);

    // Build full conversation history
    let history: Message[] = existingTask?.history
      ? existingTask.history.filter(m => m.messageId !== userMessage.messageId)
      : [];
    history.push(userMessage);

    const messages = history
      .map((m) => ({
        role: (m.role === 'agent' ? 'model' : 'user') as 'user' | 'model',
        content: m.parts
          .filter((p): p is TextPart => p.kind === 'text' && !!(p as TextPart).text)
          .map((p) => ({ text: (p as TextPart).text })),
      }))
      .filter((m) => m.content.length > 0);

    // NO RAG — pass the full Meditations text as a single context block
    const meditationsContext = meditationsText;

    const response = await stoicAgentPrompt(
      { meditations: meditationsContext },
      { messages }
    );

    const responseText = response.text;
    const lines = responseText.trim().split('\n');
    const finalStateLine = lines.at(-1)?.trim().toUpperCase();
    const agentReplyText = lines.slice(0, lines.length - 1).join('\n').trim();

    const finalA2AState: TaskState =
      finalStateLine === 'COMPLETED' ? "completed" :
      finalStateLine === 'AWAITING_USER_INPUT' ? "input-required" : "completed";

    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: finalA2AState,
        message: {
          kind: 'message',
          role: 'agent',
          messageId: crypto.randomUUID(),
          parts: [{ kind: 'text', text: agentReplyText || "Completed." }],
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
  name: 'Minimal Stoic Guide',
  description: 'A minimal Stoic agent using the real LLM and full Meditations text, but NO RAG. For testing conversation history.',
  url: 'http://localhost:41245/',
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
      id: 'stoic_reflection',
      name: 'Stoic Reflection',
      description: 'Answer questions about Stoic philosophy using Marcus Aurelius\' Meditations.',
      tags: ['stoicism', 'philosophy', 'reflection'],
      examples: ['What is courage?', 'Tell me about 42'],
    },
  ],
};

async function main() {
  const taskStore: TaskStore = new InMemoryTaskStore();
  const agentExecutor: AgentExecutor = new MinimalStoicAgentExecutor();
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, agentExecutor);

  const expressApp = express();
  expressApp.use(cors());

  const appBuilder = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
  const a2aApp = appBuilder.setupRoutes(expressApp);
  expressApp.use("/api/rest", restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  const PORT = 41245;
  a2aApp.listen(PORT, () => {
    console.log(`[Minimal Stoic] Running on http://localhost:${PORT}`);
    console.log(`[Minimal Stoic] Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
    console.log(`[Minimal Stoic] NO RAG — uses full Meditations text as static context`);
  });
}

main().catch(console.error);
