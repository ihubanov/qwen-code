/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview BackgroundAgentViewContext — React state for the
 * Background tasks dialog.
 *
 * The dialog is a single overlay with two internal modes:
 *   - `list`: sectioned list of running and completed background agents
 *   - `detail`: compact per-agent detail (Progress + Prompt + Error)
 *
 * State carried here:
 *   - live snapshot of `BackgroundAgentEntry[]` (from the registry)
 *   - whether the overlay is mounted (`dialogOpen`)
 *   - which internal mode is active (`dialogMode`)
 *   - which row is focused (`selectedIndex`)
 *
 * The subscription plumbing (registry callbacks → entries) lives in
 * `useBackgroundAgentView`, invoked once inside the provider so it owns
 * the single-slot `setStatusChangeCallback` for the TUI's lifetime.
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

export type BackgroundDialogMode = 'list' | 'detail';

export interface BackgroundAgentViewState {
  /** Live snapshot of every background agent entry, ordered by startTime. */
  entries: readonly BackgroundAgentEntry[];
  /** Index into `entries` for the currently focused row (0-based). */
  selectedIndex: number;
  /** Whether the Background tasks overlay is mounted. */
  dialogOpen: boolean;
  /** Which internal mode the overlay is rendering. */
  dialogMode: BackgroundDialogMode;
}

export interface BackgroundAgentViewActions {
  /** Set which row is focused (no-op when index is out of range). */
  setSelectedIndex(index: number): void;
  /** Move selection up by one; clamps at 0. Returns `true` if moved. */
  moveSelectionUp(): boolean;
  /** Move selection down by one; clamps at entries.length-1. Returns `true` if moved. */
  moveSelectionDown(): boolean;
  /** Open the dialog in list mode. */
  openDialog(): void;
  /** Close the dialog regardless of mode. */
  closeDialog(): void;
  /** Enter detail mode for the currently selected entry. */
  enterDetail(): void;
  /** Return from detail mode to list mode. */
  exitDetail(): void;
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
  dialogOpen: false,
  dialogMode: 'list',
};

const noop = () => {};
const noopBool = () => false;

const DEFAULT_ACTIONS: BackgroundAgentViewActions = {
  setSelectedIndex: noop,
  moveSelectionUp: noopBool,
  moveSelectionDown: noopBool,
  openDialog: noop,
  closeDialog: noop,
  enterDetail: noop,
  exitDetail: noop,
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
  // Entries are driven by the registry subscription in
  // useBackgroundAgentView. Local React state holds the overlay concerns.
  const { entries } = useBackgroundAgentView(config ?? null);

  const [rawSelectedIndex, setRawSelectedIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<BackgroundDialogMode>('list');

  // Single clamp on read — `rawSelectedIndex` can fall out of range when
  // entries shrink between renders.
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

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setDialogMode('list');
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogMode('list');
  }, []);

  const enterDetail = useCallback(() => {
    if (entries.length === 0) return;
    setDialogMode('detail');
  }, [entries.length]);

  const exitDetail = useCallback(() => {
    setDialogMode('list');
  }, []);

  const state: BackgroundAgentViewState = useMemo(
    () => ({
      entries,
      selectedIndex,
      dialogOpen,
      dialogMode,
    }),
    [entries, selectedIndex, dialogOpen, dialogMode],
  );

  const actions: BackgroundAgentViewActions = useMemo(
    () => ({
      setSelectedIndex,
      moveSelectionUp,
      moveSelectionDown,
      openDialog,
      closeDialog,
      enterDetail,
      exitDetail,
    }),
    [
      setSelectedIndex,
      moveSelectionUp,
      moveSelectionDown,
      openDialog,
      closeDialog,
      enterDetail,
      exitDetail,
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
