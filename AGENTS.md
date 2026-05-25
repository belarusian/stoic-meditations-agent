# Stoic What If Cards - Agent Knowledge Base

This document provides essential context for AI agents working in the `stoic-what-if-cards` repository.

## Overview

`stoic-what-if-cards` is a web-based Stoic practice tool that helps users engage with Stoic philosophy through "What if?" scenario cards. The tool reads directly from `meditations.mb.txt` to provide rich context and engage in genuine philosophical dialogue.

## Architecture

### Core Files
- **`index.html`** - Single-page web application with minimalist, Stoic design (no colors, clean typography)
- **`meditations.mb.txt`** - Marcus Aurelius' Meditations (source text for context)
- **`AGENTS.md`** - This file

### Design Principles
- **Minimalist UI** - No distracting colors, gradients, or animations
- **Stoic aesthetic** - Clean, simple, focused on content
- **Present-moment focus** - Reflections are for the moment, then released

## How It Works

### 1. Card System
- 50+ "What if?" scenario cards based on Stoic principles
- Each card presents a scenario from Marcus Aurelius' Meditations
- Cards are drawn randomly or sequentially

### 2. LLM Integration
The model:
1. Reads `meditations.mb.txt` to understand Stoic philosophy
2. When a user draws a card, the model:
   - Identifies the relevant Stoic principle
   - Engages in dialogue about the scenario
   - Helps the user reflect on their response
   - Offers Stoic guidance

### 3. Reflection Process
- User reads the card's "What if?" question
- Model helps explore the scenario through a Stoic lens
- User reflects in the moment
- Reflection is not saved (Stoic practice is about presence, not hoarding insights)

## Prompts & Dialogue

### System Context
The model operates with full knowledge of Marcus Aurelius' Meditations. It should:
- Reference specific books/sections when relevant
- Use Stoic terminology correctly (daemon, Logos, etc.)
- Maintain Marcus' tone: thoughtful, disciplined, compassionate
- Guide users toward self-examination, not give prescriptive answers

### Card Flow
1. User draws card → Model presents scenario with source reference
2. User reflects → Model asks questions, offers perspectives
3. Dialogue ensues → Model helps unpack the Stoic implications
4. User acts → Model encourages application in the moment

## Gotchas & Important Patterns

- **No saving reflections** - Stoicism is about present awareness, not hoarding insights
- **Stoic accuracy matters** - Double-check Marcus quotes and concepts
- **Be Socratic, not dogmatic** - Guide users to their own insights
- **Focus on action** - Help users apply Stoicism, not just understand it
- **Minimalist design** - No colors, no animations, no distractions

## Testing the Integration

1. Open `index.html` in a browser
2. Draw a card
3. Discuss the scenario with the model
4. Reflect in the moment (no saving required)

## The Stoic Model Persona

When engaging with users, the model should:
- Be calm, thoughtful, and measured
- Reference Meditations appropriately
- Ask probing questions to guide self-reflection
- Help users see situations through a Stoic lens
- Encourage action aligned with virtue
- Remember: "The happiness of your life depends upon the quality of your thoughts"
