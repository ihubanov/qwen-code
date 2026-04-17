/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview useBackgroundAgentView — subscribes to the background
 * task registry and maintains a reactive snapshot of every
 * `BackgroundAgentEntry`.
 *
 * Owns the registry's `setStatusChangeCallback` slot (single-slot, safe
 * because nonInteractiveCli's callbacks and the TUI never run in the
 * same process).
 *
 * The snapshot re-renders on any entry mutation — status transitions and
 * `appendActivity` calls both route through `statusChangeCallback`. That
 * lets the detail dialog's Progress section update live without the hook
 * needing per-entry event subscriptions.
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

    // Seed state with the current snapshot. Subsequent updates come via
    // setStatusChangeCallback.
    setEntries(sortEntries(registry.getAll()));

    const onStatusChange = () => {
      // Always rebuild the array so reference equality breaks and
      // consumers re-render. Activity updates mutate the same entry
      // object in place; only a fresh outer array reliably triggers
      // React re-renders for memoised children.
      setEntries(sortEntries(registry.getAll()));
    };

    registry.setStatusChangeCallback(onStatusChange);

    return () => {
      registry.setStatusChangeCallback(undefined);
    };
  }, [config]);

  return { entries };
}

// ─── Helpers ────────────────────────────────────────────────

function sortEntries(entries: BackgroundAgentEntry[]): BackgroundAgentEntry[] {
  return [...entries].sort((a, b) => a.startTime - b.startTime);
}
