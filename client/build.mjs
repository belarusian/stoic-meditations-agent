import * as esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(__dirname);
const distDir = resolve(clientDir, 'dist');

// 1. Run tests
console.log('[build] Running tests...');
const testResult = spawnSync('npx', ['vitest', 'run'], {
  cwd: clientDir,
  stdio: 'inherit',
  shell: true,
});
if (testResult.status !== 0) {
  console.error('[build] Tests failed, aborting build.');
  process.exit(1);
}
console.log('[build] Tests passed.');

// 2. Build client.ts -> dist/client.js
console.log('[build] Building client module...');
mkdirSync(distDir, { recursive: true });
await esbuild.build({
  entryPoints: ['src/client.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  outfile: resolve(distDir, 'client.js'),
});
console.log('[build] Built dist/client.js');

// 3. Build index.html -> dist/index.html
console.log('[build] Building index.html...');
let html = readFileSync(resolve(clientDir, 'index.html'), 'utf-8');

const appScript = `
<script type="module">
    import { ClientFactory } from 'https://esm.sh/@a2a-js/sdk/client';
    import { marked } from 'https://esm.sh/marked';

    // Use the bundled client module for testable logic
    import { extractTextFromEvent, isConversationFinished, renderText } from './client.js';

    let client = null;
    let contextId = null;
    let taskId = null;
    let loadingDiv = null;

    function addMessage(role, text) {
        const chat = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + role;
        if (role === 'agent') {
            const header = document.createElement('div');
            header.className = 'message-header';
            header.textContent = 'Stoic Guide';
            msgDiv.appendChild(header);
        }
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = marked.parse(renderText(text));
        msgDiv.appendChild(content);
        chat.appendChild(msgDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    async function sendUserMessage(text) {
        if (!client || !text.trim()) return;
        addMessage('user', text);
        const userMessage = {
            kind: 'message',
            messageId: crypto.randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', text }],
        };
         if (contextId) userMessage.contextId = contextId;
            if (taskId) userMessage.taskId = taskId;
            console.log('[client] Sending message, taskId:', taskId, 'contextId:', contextId);

        loadingDiv = document.createElement('div');
        loadingDiv.className = 'message agent loading';
        loadingDiv.innerHTML = '<div class="content">Consulting the Meditations...</div>';
        const chat = document.getElementById('chat-messages');
        chat.appendChild(loadingDiv);
        chat.scrollTop = chat.scrollHeight;

        try {
            const stream = client.sendMessageStream({ message: userMessage });
            let response = '';
            let lastFinalState = null;
            for await (const event of stream) {
                if (event.kind === 'status-update') {
                    if (event.status?.state === 'working' && event.status.message) {
                        const wt = event.status.message.parts[0]?.text || '';
                        loadingDiv.innerHTML = '<div class="content">Consulting the Meditations...<br><small style="opacity:0.7">' + wt + '</small></div>';
                    }
                    if (event.final && event.status?.message && event.status.message.messageId !== lastFinalState) {
                        lastFinalState = event.status.message.messageId;
                        const t = extractTextFromEvent(event);
                        if (t) response = t;
                    }
                } else {
                    const t = extractTextFromEvent(event);
                    if (t) response = t;
                }
                if (event.contextId) contextId = event.contextId;
                if (event.taskId) taskId = event.taskId;
                if (response) loadingDiv.innerHTML = '<div class="content">' + renderText(response) + '</div>';
            }
            chat.removeChild(loadingDiv);
            loadingDiv = null;
            if (response) addMessage('agent', response);
            // When the agent explicitly finishes, reset taskId so the next
            // message gets a fresh task (the old one is locked by the SDK).
            if (isConversationFinished(response)) {
                console.log('[client] Agent finished conversation, resetting taskId');
                taskId = null;
            }
        } catch (error) {
            if (loadingDiv) { try { chat.removeChild(loadingDiv); } catch (e) {} loadingDiv = null; }
            console.error('Error with agent:', error);
            addMessage('agent', 'Error: Could not connect to Stoic Guide.');
        }
    }

    async function startNewDialogue() {
        const initialPrompt = "I seek guidance from the Stoic wisdom of Marcus Aurelius. What should I reflect on today?";
        addMessage('user', initialPrompt);
        const userMessage = {
            kind: 'message',
            messageId: crypto.randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', text: initialPrompt }],
        };
        loadingDiv = document.createElement('div');
        loadingDiv.className = 'message agent loading';
        loadingDiv.innerHTML = '<div class="content">Consulting the Meditations...</div>';
        const chat = document.getElementById('chat-messages');
        chat.appendChild(loadingDiv);
        chat.scrollTop = chat.scrollHeight;
        try {
            const stream = client.sendMessageStream({ message: userMessage });
            let response = '';
            let lastFinalState = null;
            for await (const event of stream) {
                if (event.kind === 'status-update') {
                    if (event.final && event.status?.message && event.status.message.messageId !== lastFinalState) {
                        lastFinalState = event.status.message.messageId;
                        const t = extractTextFromEvent(event);
                        if (t) response = t;
                    }
                } else {
                    const t = extractTextFromEvent(event);
                    if (t) response = t;
                }
                if (event.contextId) contextId = event.contextId;
                if (event.taskId) taskId = event.taskId;
            }
            chat.removeChild(loadingDiv);
            loadingDiv = null;
            if (response) addMessage('agent', response);
        } catch (error) {
            if (loadingDiv) { try { chat.removeChild(loadingDiv); } catch (e) {} loadingDiv = null; }
            console.error('Error starting dialogue:', error);
            addMessage('agent', 'Error connecting to Stoic Guide.');
        }
    }

    // Initialize
    (async function() {
        try {
            const factory = new ClientFactory();
            client = await factory.createFromUrl('http://localhost:41242');
            console.log('Connected to Stoic Guide agent');
            startNewDialogue();
        } catch (error) {
            console.error('Failed to connect to agent:', error);
            addMessage('agent', 'Connecting to Stoic Guide... please wait.');
        }
    })();

    // Event listeners
    document.getElementById('send-btn').addEventListener('click', () => {
        const input = document.getElementById('user-input');
        const text = input.value;
        if (text.trim()) { sendUserMessage(text); input.value = ''; input.style.height = '52px'; }
    });
    document.getElementById('user-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const input = document.getElementById('user-input');
            if (input.value.trim()) { sendUserMessage(input.value); input.value = ''; input.style.height = '52px'; }
        }
    });
    document.getElementById('user-input').addEventListener('input', function() {
        this.style.height = '52px';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
</script>
`;

html = html.replace('<!-- PLACEHOLDER_SCRIPT -->', appScript);
writeFileSync(resolve(distDir, 'index.html'), html);
console.log('[build] Built dist/index.html');

// 4. Copy built assets to root dist/ for serving
const rootDistDir = resolve(resolve(__dirname, '..'), 'dist');
mkdirSync(rootDistDir, { recursive: true });
copyFileSync(resolve(distDir, 'index.html'), resolve(rootDistDir, 'index.html'));
copyFileSync(resolve(distDir, 'client.js'), resolve(rootDistDir, 'client.js'));
console.log('[build] Copied dist/ files to root dist/');

console.log('[build] Done.');
