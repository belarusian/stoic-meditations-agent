import { ClientFactory } from '@a2a-js/sdk/client';

const factory = new ClientFactory();
const client = await factory.createFromUrl('http://localhost:41245');

// Message 1: give a specific number
const r1 = await client.sendMessage({
  message: { kind: 'message', messageId: crypto.randomUUID(), role: 'user', parts: [{ kind: 'text', text: 'I am reflecting on the number 42 today.' }] }
});
const text1 = r1.kind === 'message' ? r1.parts[0].text : r1.status?.message?.parts[0]?.text;
console.log('=== Reply 1 ===');
console.log(text1.slice(0, 200) + '...');

const t1 = r1.id || r1.status?.message?.taskId;

// Message 2: ask about the number
const r2 = await client.sendMessage({
  message: { kind: 'message', messageId: crypto.randomUUID(), role: 'user', parts: [{ kind: 'text', text: 'What number was I reflecting on?' }], taskId: t1 }
});
const text2 = r2.kind === 'message' ? r2.parts[0].text : r2.status?.message?.parts[0]?.text;
console.log('\n=== Reply 2 ===');
console.log(text2.slice(0, 200) + '...');

if (text2.includes('42')) {
  console.log('\n✅ Minimal Stoic agent remembers 42 — conversation history works with real LLM');
} else {
  console.log('\n❌ Minimal Stoic agent forgot 42 — the problem is in the prompt, not RAG');
}
