/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview useBackgroundAgentView — subscribes to the background
 * task registry and maintains a reactive snapshot of every
 * `BackgroundAgentEntry`, plus an "unread" set for terminal-state
 * agents the user has not yet opened in the detail view.
 *
 * The hook owns the registry's `setStatusChangeCallback` slot
 * (single-slot — safe because the nonInteractive CLI, which also uses
 * callbacks on this registry, never runs alongside the React TUI).
 *
 * Per-agent live updates (tool calls / round text landing during a run)
 * are intentionally NOT subscribed here: the footer rows only display
 * status + label + unread, all of which change via the registry callback.
 * The detail view subscribes to its own agent's emitter via
 * `AgentChatContent`, so live transcript updates work there without
 * forcing a full provider re-render on every tool event.
 *
 * State surface (returned object):
 *   - `entries`: ordered list of entries (oldest → newest by startTime)
 *   - `unread`: Set<agentId> of terminal-state entries not yet viewed
 *   - `clearUnread(agentId)`: remove an entry from the unread set
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BACKGROUND_TERMINAL_STATUSES,
  type BackgroundAgentEntry,
  type Config,
} from '@qwen-code/qwen-code-core';

export interface UseBackgroundAgentViewResult {
  entries: readonly BackgroundAgentEntry[];
  unread: ReadonlySet<string>;
  clearUnread(agentId: string): void;
}

export function useBackgroundAgentView(
  config: Config | null,
): UseBackgroundAgentViewResult {
  const [entries, setEntries] = useState<BackgroundAgentEntry[]>([]);
  const [unread, setUnread] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!config) return;
    const registry = config.getBackgroundTaskRegistry();

    // Seed state with the current snapshot. Subsequent updates come via
    // setStatusChangeCallback.
    setEntries(sortEntries(registry.getAll()));

    const onStatusChange = (entry: BackgroundAgentEntry) => {
      const all = sortEntries(registry.getAll());
      // Reuse the previous reference when nothing observable changed —
      // status callbacks fire on every transition, but consumers only
      // re-render when the (id, status) tuple list shifts.
      setEntries((prev) => (entriesEqual(prev, all) ? prev : all));

      // Unread tracks the transition non-terminal → terminal for the
      // specific entry whose status just changed. Iterating across
      // every terminal entry here would re-mark agents the user has
      // already cleared via `clearUnread` whenever an unrelated agent
      // later transitions.
      if (BACKGROUND_TERMINAL_STATUSES.has(entry.status)) {
        setUnread((prev) => {
          if (prev.has(entry.agentId)) return prev;
          const next = new Set(prev);
          next.add(entry.agentId);
          return next;
        });
      }
    };

    registry.setStatusChangeCallback(onStatusChange);

    return () => {
      registry.setStatusChangeCallback(undefined);
    };
  }, [config]);

  const clearUnread = useCallback((agentId: string) => {
    setUnread((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  return { entries, unread, clearUnread };
}

// ─── Helpers ────────────────────────────────────────────────

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
