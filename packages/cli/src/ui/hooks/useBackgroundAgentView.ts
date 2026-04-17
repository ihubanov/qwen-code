/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useBackgroundAgentView — subscribes to the background task registry's
 * status-change callback and maintains a reactive snapshot of every
 * `BackgroundAgentEntry`.
 *
 * Intentionally ignores activity updates (appendActivity). Tool-call
 * traffic from a running background agent would otherwise churn the
 * Footer pill and the AppContainer every few hundred ms. The detail
 * dialog subscribes to the activity callback directly when it needs
 * live Progress updates.
 */

import { useState, useEffect } from 'react';
import {
  type BackgroundAgentEntry,
  type Config,
} from '@qwen-code/qwen-code-core';

export interface UseBackgroundAgentViewResult {
  entries: readonly BackgroundAgentEntry[];
}

export function useBackgroundAgentView(
  config: Config | null,
): UseBackgroundAgentViewResult {
  const [entries, setEntries] = useState<BackgroundAgentEntry[]>([]);

  useEffect(() => {
    if (!config) return;
    const registry = config.getBackgroundTaskRegistry();

    setEntries(sortEntries(registry.getAll()));

    const onStatusChange = () => {
      const all = sortEntries(registry.getAll());
      // Skip the state update when the (id, status) tuple list is
      // unchanged — prevents re-renders for callbacks that don't
      // actually change what the roster/pill shows.
      setEntries((prev) => (entriesEqual(prev, all) ? prev : all));
    };

    registry.setStatusChangeCallback(onStatusChange);

    return () => {
      registry.setStatusChangeCallback(undefined);
    };
  }, [config]);

  return { entries };
}

function sortEntries(entries: BackgroundAgentEntry[]): BackgroundAgentEntry[] {
  return [...entries].sort((a, b) => a.startTime - b.startTime);
}

function entriesEqual(
  a: readonly BackgroundAgentEntry[],
  b: readonly BackgroundAgentEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.agentId !== b[i]!.agentId || a[i]!.status !== b[i]!.status) {
      return false;
    }
  }
  return true;
}
