import { describe, it, expect } from 'vitest';
import {
  renderText,
  extractTextFromEvent,
} from '../src/client';

describe('renderText', () => {
  it('strips trailing AWAITING_USER_INPUT marker', () => {
    expect(renderText('Hello world\nAWAITING_USER_INPUT')).toBe('Hello world');
  });

  it('strips trailing COMPLETED marker', () => {
    expect(renderText('Hello world\nCOMPLETED')).toBe('Hello world');
  });

  it('strips markers from the end of multiline text', () => {
    expect(renderText('Part 1\n\nPart 2\n\nCOMPLETED')).toBe('Part 1\n\nPart 2');
  });

  it('does NOT strip markers from the middle of text (e.g., in quotes)', () => {
    // A quote containing the word COMPLETED should stay intact
    expect(renderText('He said: "I will finish this task and then COMPLETED my work."')).toBe('He said: "I will finish this task and then COMPLETED my work."');
  });

  it('leaves text unchanged if no markers present', () => {
    expect(renderText('Just normal text')).toBe('Just normal text');
  });
});

describe('extractTextFromEvent', () => {
  it('extracts text from a status-update event', () => {
    const event = {
      kind: 'status-update',
      status: {
        state: 'completed',
        message: {
          messageId: 'abc123',
          parts: [{ text: 'Here is the answer' }],
        },
      },
      final: true,
    };
    expect(extractTextFromEvent(event)).toBe('Here is the answer');
  });

  it('extracts text from a message event', () => {
    const event = {
      kind: 'message',
      parts: [{ text: 'Direct response text' }],
    };
    expect(extractTextFromEvent(event)).toBe('Direct response text');
  });

  it('extracts text from a task event', () => {
    const event = {
      kind: 'task',
      status: {
        message: {
          messageId: 'abc123',
          parts: [{ text: 'Task message text' }],
        },
      },
    };
    expect(extractTextFromEvent(event)).toBe('Task message text');
  });

  it('returns empty string for unrecognized events', () => {
    expect(extractTextFromEvent({ kind: 'unknown' })).toBe('');
  });

  it('returns empty string when message has no text parts', () => {
    const event = {
      kind: 'status-update',
      status: {
        state: 'completed',
        message: {
          messageId: 'abc123',
          parts: [],
        },
      },
      final: true,
    };
    expect(extractTextFromEvent(event)).toBe('');
  });
});
