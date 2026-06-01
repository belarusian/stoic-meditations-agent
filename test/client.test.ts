import { describe, it, expect } from 'vitest';
import {
  isConversationFinished,
  renderText,
  extractTextFromEvent,
} from '../src/client';

describe('isConversationFinished', () => {
  it('returns true when response ends with COMPLETED but not AWAITING_USER_INPUT', () => {
    expect(isConversationFinished('Some text\nCOMPLETED')).toBe(true);
    expect(isConversationFinished('Just saying COMPLETED')).toBe(true);
  });

  it('returns false when response contains AWAITING_USER_INPUT', () => {
    expect(isConversationFinished('Some text\nAWAITING_USER_INPUT')).toBe(false);
    expect(isConversationFinished('Some text\nCOMPLETED\nAWAITING_USER_INPUT')).toBe(false);
  });

  it('returns false when response does not mention completion markers', () => {
    expect(isConversationFinished('Just a normal response')).toBe(false);
  });
});

describe('renderText', () => {
  it('strips trailing AWAITING_USER_INPUT marker', () => {
    expect(renderText('Hello world\nAWAITING_USER_INPUT')).toBe('Hello world');
  });

  it('strips trailing COMPLETED marker', () => {
    expect(renderText('Hello world\nCOMPLETED')).toBe('Hello world');
  });

  it('strips markers from the middle of multiline text', () => {
    expect(renderText('Part 1\n\nPart 2\n\nCOMPLETED')).toBe('Part 1\n\nPart 2');
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
