/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { BackgroundAgentEntry } from '@qwen-code/qwen-code-core';
import { getPillLabel } from './BackgroundTasksPill.js';

function entry(overrides: Partial<BackgroundAgentEntry>): BackgroundAgentEntry {
  return {
    agentId: 'a',
    description: 'desc',
    status: 'running',
    startTime: 0,
    abortController: new AbortController(),
    ...overrides,
  };
}

describe('getPillLabel', () => {
  it('returns empty string for no running entries', () => {
    expect(getPillLabel([])).toBe('');
  });

  it('uses singular form for one running agent', () => {
    expect(getPillLabel([entry({ agentId: 'a' })])).toBe('1 local agent');
  });

  it('uses plural form for multiple running agents', () => {
    expect(
      getPillLabel([
        entry({ agentId: 'a' }),
        entry({ agentId: 'b' }),
        entry({ agentId: 'c' }),
      ]),
    ).toBe('3 local agents');
  });
});
