/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview BackgroundAgentViewContext — React state for the
 * background-agent footer and responsive detail view.
 *
 * Holds:
 *   - the live snapshot of `BackgroundAgentEntry[]`,
 *   - the currently selected footer row,
 *   - the unread set (terminal-state agents the user hasn't viewed yet),
 *   - the detail-open target (agentId whose detail view is rendered),
 *   - the footer-focused flag used by keyboard routing.
 *
 * Parallel to `AgentViewContext` (team / Arena agents), but simpler —
 * no per-agent composer state, no tabs, no approval modes. Background
 * agents are read-only observables.
 *
 * The subscription plumbing (registry → entries, per-entry event
 * emitter → re-render) lives in `useBackgroundAgentView`, invoked once
 * inside the provider so the provider is the sole owner of lifecycle.
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  type BackgroundAgentEntry,
  type Config,
} from '@qwen-code/qwen-code-core';
import { useBackgroundAgentView } from '../hooks/useBackgroundAgentView.js';

// ─── Types ──────────────────────────────────────────────────

export interface BackgroundAgentViewState {
  /** Live snapshot of every background agent entry, ordered by startTime. */
  entries: readonly BackgroundAgentEntry[];
  /** Index into `entries` for the currently focused row (0-based). */
  selectedIndex: number;
  /** agentId of the entry whose detail view is open; null when closed. */
  detailOpenFor: string | null;
  /** agentIds of entries that have reached a terminal state without being viewed. */
  unread: ReadonlySet<string>;
  /** Whether the footer has keyboard focus (vs. composer or AgentTabBar). */
  footerFocused: boolean;
}

export interface BackgroundAgentViewActions {
  /** Set which row is focused (no-op when index is out of range). */
  setSelectedIndex(index: number): void;
  /** Move selection up by one; clamps at 0. Returns `true` if moved. */
  moveSelectionUp(): boolean;
  /** Move selection down by one; clamps at entries.length-1. Returns `true` if moved. */
  moveSelectionDown(): boolean;
  /** Open the detail view. Defaults to the currently-selected entry. */
  openDetail(agentId?: string): void;
  /** Close the detail view. */
  closeDetail(): void;
  /** Clear the unread marker for a specific agentId. */
  markRead(agentId: string): void;
  /** Update footer focus state (used by keyboard routing). */
  setFooterFocused(focused: boolean): void;
}

// ─── Context ────────────────────────────────────────────────

export const BackgroundAgentViewStateContext =
  createContext<BackgroundAgentViewState | null>(null);
export const BackgroundAgentViewActionsContext =
  createContext<BackgroundAgentViewActions | null>(null);

// ─── Defaults (used when no provider is mounted) ────────────

const DEFAULT_STATE: BackgroundAgentViewState = {
  entries: [],
  selectedIndex: 0,
  detailOpenFor: null,
  unread: new Set(),
  footerFocused: false,
};

const noop = () => {};
const noopBool = () => false;

const DEFAULT_ACTIONS: BackgroundAgentViewActions = {
  setSelectedIndex: noop,
  moveSelectionUp: noopBool,
  moveSelectionDown: noopBool,
  openDetail: noop,
  closeDetail: noop,
  markRead: noop,
  setFooterFocused: noop,
};

// ─── Hooks ──────────────────────────────────────────────────

export function useBackgroundAgentViewState(): BackgroundAgentViewState {
  return useContext(BackgroundAgentViewStateContext) ?? DEFAULT_STATE;
}

export function useBackgroundAgentViewActions(): BackgroundAgentViewActions {
  return useContext(BackgroundAgentViewActionsContext) ?? DEFAULT_ACTIONS;
}

// ─── Provider ───────────────────────────────────────────────

interface BackgroundAgentViewProviderProps {
  config?: Config;
  children: React.ReactNode;
}

export function BackgroundAgentViewProvider({
  config,
  children,
}: BackgroundAgentViewProviderProps) {
  // Entries + unread are driven by the registry subscription in
  // useBackgroundAgentView. Local React state holds the UI concerns:
  // selection index, detail-open target, focus flag.
  const { entries, unread, clearUnread } = useBackgroundAgentView(
    config ?? null,
  );

  const [rawSelectedIndex, setRawSelectedIndex] = useState(0);
  const [detailOpenFor, setDetailOpenFor] = useState<string | null>(null);
  const [footerFocused, setFooterFocused] = useState(false);

  // Single clamp on read — `rawSelectedIndex` can fall out of range when
  // entries shrink between renders. Callers that mutate it pre-clamp,
  // but external resizes (e.g. an agent finishing and being filtered out)
  // happen outside callback control.
  const selectedIndex =
    entries.length === 0
      ? 0
      : Math.min(Math.max(0, rawSelectedIndex), entries.length - 1);

  const setSelectedIndex = useCallback(
    (index: number) => {
      if (entries.length === 0) return;
      setRawSelectedIndex(Math.max(0, Math.min(entries.length - 1, index)));
    },
    [entries.length],
  );

  const moveSelectionUp = useCallback((): boolean => {
    if (selectedIndex <= 0) return false;
    setRawSelectedIndex(selectedIndex - 1);
    return true;
  }, [selectedIndex]);

  const moveSelectionDown = useCallback((): boolean => {
    if (entries.length === 0) return false;
    if (selectedIndex >= entries.length - 1) return false;
    setRawSelectedIndex(selectedIndex + 1);
    return true;
  }, [entries.length, selectedIndex]);

  const markRead = useCallback(
    (agentId: string) => {
      clearUnread(agentId);
    },
    [clearUnread],
  );

  const openDetail = useCallback(
    (agentId?: string) => {
      if (entries.length === 0) return;
      const target = agentId ?? entries[selectedIndex]?.agentId ?? null;
      if (!target) return;
      setDetailOpenFor(target);
      clearUnread(target);
    },
    [entries, selectedIndex, clearUnread],
  );

  const closeDetail = useCallback(() => {
    setDetailOpenFor(null);
  }, []);

  const state: BackgroundAgentViewState = useMemo(
    () => ({
      entries,
      selectedIndex,
      detailOpenFor,
      unread,
      footerFocused,
    }),
    [entries, selectedIndex, detailOpenFor, unread, footerFocused],
  );

  const actions: BackgroundAgentViewActions = useMemo(
    () => ({
      setSelectedIndex,
      moveSelectionUp,
      moveSelectionDown,
      openDetail,
      closeDetail,
      markRead,
      setFooterFocused,
    }),
    [
      setSelectedIndex,
      moveSelectionUp,
      moveSelectionDown,
      openDetail,
      closeDetail,
      markRead,
    ],
  );

  return (
    <BackgroundAgentViewStateContext.Provider value={state}>
      <BackgroundAgentViewActionsContext.Provider value={actions}>
        {children}
      </BackgroundAgentViewActionsContext.Provider>
    </BackgroundAgentViewStateContext.Provider>
  );
}
