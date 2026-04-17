/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import type { BackgroundAgentEntry } from '@qwen-code/qwen-code-core';
import { BackgroundAgentViewStateContextForTest } from './testContextHelpers.js';
import {
  BackgroundTasksFooter,
  buildEntryLabel,
} from './BackgroundTasksFooter.js';

// useKeypress depends on a KeypressProvider that's only mounted inside
// the full app. Stub it out — these tests only assert on rendering, not
// on key handling.
vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

function makeEntry(
  overrides: Partial<BackgroundAgentEntry> = {},
): BackgroundAgentEntry {
  return {
    agentId: 'agent-1',
    description: 'test task',
    subagentType: 'Explore',
    status: 'running',
    startTime: Date.now(),
    abortController: new AbortController(),
    ...overrides,
  } as BackgroundAgentEntry;
}

describe('buildEntryLabel', () => {
  it('prepends subagentType when absent from the description', () => {
    expect(buildEntryLabel(makeEntry({ description: 'do the thing' }))).toBe(
      'Explore: do the thing',
    );
  });

  it('strips redundant subagentType prefix from the description', () => {
    expect(
      buildEntryLabel(makeEntry({ description: 'Explore: do the thing' })),
    ).toBe('Explore: do the thing');
  });

  it('is case-insensitive when stripping the prefix', () => {
    expect(
      buildEntryLabel(makeEntry({ description: 'explore: do the thing' })),
    ).toBe('Explore: do the thing');
  });

  it('truncates descriptions longer than 40 characters with an ellipsis', () => {
    const long = 'x'.repeat(80);
    const label = buildEntryLabel(makeEntry({ description: long }));
    expect(label.startsWith('Explore: ')).toBe(true);
    // After the prefix: 39 x's + ellipsis = 40 total for the truncated portion.
    const descPart = label.slice('Explore: '.length);
    expect(descPart).toHaveLength(40);
    expect(descPart.endsWith('\u2026')).toBe(true);
  });

  it('omits the prefix when subagentType is absent', () => {
    expect(
      buildEntryLabel(
        makeEntry({ subagentType: undefined, description: 'standalone' }),
      ),
    ).toBe('standalone');
  });
});

describe('BackgroundTasksFooter', () => {
  it('renders nothing when no entries exist', () => {
    const { lastFrame } = render(
      <BackgroundAgentViewStateContextForTest
        entries={[]}
        selectedIndex={0}
        detailOpenFor={null}
        unread={new Set()}
        footerFocused={false}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    );
    expect(lastFrame()).toBe('');
  });

  it('renders a row per entry with the correct glyph', () => {
    const { lastFrame } = render(
      <BackgroundAgentViewStateContextForTest
        entries={[
          makeEntry({ agentId: 'a', description: 'running one' }),
          makeEntry({
            agentId: 'b',
            status: 'completed',
            description: 'done two',
          }),
          makeEntry({
            agentId: 'c',
            status: 'failed',
            description: 'bad three',
          }),
        ]}
        selectedIndex={0}
        detailOpenFor={null}
        unread={new Set()}
        footerFocused={false}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    );
    const frame = lastFrame();
    expect(frame).toContain('\u25CF'); // ● running
    expect(frame).toContain('\u2713'); // ✓ completed
    expect(frame).toContain('\u2717'); // ✗ failed
    expect(frame).toContain('Explore: running one');
    expect(frame).toContain('Explore: done two');
    expect(frame).toContain('Explore: bad three');
  });

  it('shows the unread marker for agents in the unread set', () => {
    const { lastFrame } = render(
      <BackgroundAgentViewStateContextForTest
        entries={[
          makeEntry({ agentId: 'a', status: 'completed', description: 'read' }),
          makeEntry({
            agentId: 'b',
            status: 'completed',
            description: 'unread',
          }),
        ]}
        selectedIndex={0}
        detailOpenFor={null}
        unread={new Set(['b'])}
        footerFocused={false}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    );
    const lines = lastFrame()!.split('\n');
    const readLine = lines.find((l) => l.includes('read'))!;
    const unreadLine = lines.find((l) => l.includes('unread'))!;
    expect(readLine).not.toContain('\u00B7');
    expect(unreadLine).toContain('\u00B7');
  });

  it('shows an overflow line when more entries exist than fit', () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      makeEntry({ agentId: `a${i}`, description: `task ${i}` }),
    );
    const { lastFrame } = render(
      <BackgroundAgentViewStateContextForTest
        entries={entries}
        selectedIndex={0}
        detailOpenFor={null}
        unread={new Set()}
        footerFocused={false}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    );
    const frame = lastFrame()!;
    expect(frame).toMatch(/\u2026and \d+ more/);
  });

  it('highlights the selected row only when the footer is focused', () => {
    const entries = [
      makeEntry({ agentId: 'a', description: 'first' }),
      makeEntry({ agentId: 'b', description: 'second' }),
    ];
    const unfocused = render(
      <BackgroundAgentViewStateContextForTest
        entries={entries}
        selectedIndex={1}
        detailOpenFor={null}
        unread={new Set()}
        footerFocused={false}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    ).lastFrame()!;
    const focused = render(
      <BackgroundAgentViewStateContextForTest
        entries={entries}
        selectedIndex={1}
        detailOpenFor={null}
        unread={new Set()}
        footerFocused={true}
      >
        <BackgroundTasksFooter />
      </BackgroundAgentViewStateContextForTest>,
    ).lastFrame()!;

    // Without focus, the chevron gutter is empty; with focus, the
    // selected row gets a leading `›`.
    expect(unfocused).not.toContain('\u203A');
    expect(focused).toContain('\u203A');
  });
});
