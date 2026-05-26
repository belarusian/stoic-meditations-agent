# Stoic What If Cards - Agent Guide

This agent helps you practice Stoic philosophy through "What if?" scenarios. It reads Marcus Aurelius' *Meditations* directly to provide rich, accurate context.

## Overview

This is an A2A-compliant agent that:
- Reads `meditations.mb.txt` for authentic Stoic context
- Engages in conversation about Stoic scenarios
- Helps you reflect on present-moment responses
- Does NOT save reflections ( Stoicism is about presence, not hoarding insights)

## Setup

1. **Set your Google API key:**
   ```bash
   export GOOGLE_API_KEY=your_api_key_here
   ```

2. **Start the agent:**
   ```bash
   npm run agents:stoic
   ```

3. **Use the CLI to chat:**
   ```bash
   npm run a2a:cli http://localhost:41242
   ```

## How It Works

### Reading Meditations
The agent reads the full *Meditations* text on startup and includes it in prompts:

```typescript
const meditationsText = readFileSync(meditationsPath, "utf-8");
```

### The Prompt
The agent uses a Genkit prompt that:
1. Includes the full Meditations text as context
2. Presents the "What if?" scenario
3. Asks for Stoic reflection and guidance
4. Reminds the user to focus on the present moment

### Conversation Flow
1. User draws a card → Agent presents the scenario with source
2. User reflects → Agent engages in dialogue about the Stoic perspective
3. User responds → Agent provides guidance based on Meditations
4. No saving → The reflection is for the moment, then released

## Skills

### `stoic_reflection`
Answers questions about Stoic philosophy using Marcus Aurelius' *Meditations* as the authoritative source.

**Examples:**
- "What would Marcus say about dealing with anger?"
- "How should I respond if someone insults me?"
- "What does Stoicism say about loss and grief?"

## Running as an Agent

To run this as an A2A agent:

```bash
npm run agents:stoic
```

The agent will start on `http://localhost:41242`.

## Testing with CLI

In a separate terminal:

```bash
npm run a2a:cli http://localhost:41242
```

Then type your questions or use `/new` to start a fresh session.

## Design Principles

- **Simplicity** - No colors, clean typography, minimal distractions
- **Presence** - Reflections are for the moment, not saved
- **Authenticity** - Sources directly from Meditations, not interpretations
- **Dialogue** - Conversation, not lectures
- **Action** - Focus on practical application, not theory

## The Stoic Model Persona

When engaging:
- Be calm, measured, thoughtful
- Reference Meditations directly with book/section
- Ask questions to guide self-reflection
- Help users see situations through a Stoic lens
- Encourage action aligned with virtue
- Remember: "The happiness of your life depends upon the quality of your thoughts"

## Files

- `src/genkit.ts` - Genkit configuration and Meditations loading
- `src/agent.ts` - A2A agent implementation
- `src/cli.ts` - Command-line client for testing
- `index.html` - Web interface (minimalist design)
- `AGENTS.md` - This file

## Environment Variables

- `GOOGLE_API_KEY` - Required for Genkit/Gemini API access
- `STOIC_AGENT_PORT` - Port to run on (default: 41242)
