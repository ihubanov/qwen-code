/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Test-only helpers for mounting BackgroundTasksFooter /
 * BackgroundTaskDetailView with deterministic state, bypassing the
 * `useBackgroundAgentView` subscription plumbing.
 *
 * Production code does NOT import from here.
 */

import type { ReactNode } from 'react';
import {
  BackgroundAgentViewStateContext,
  BackgroundAgentViewActionsContext,
  type BackgroundAgentViewState,
  type BackgroundAgentViewActions,
} from '../../contexts/BackgroundAgentViewContext.js';

interface TestProviderProps extends BackgroundAgentViewState {
  actions?: Partial<BackgroundAgentViewActions>;
  children: ReactNode;
}

const noop = () => {};
const noopBool = () => false;

export function BackgroundAgentViewStateContextForTest({
  entries,
  selectedIndex,
  detailOpenFor,
  unread,
  footerFocused,
  actions,
  children,
}: TestProviderProps) {
  const state: BackgroundAgentViewState = {
    entries,
    selectedIndex,
    detailOpenFor,
    unread,
    footerFocused,
  };
  const mergedActions: BackgroundAgentViewActions = {
    setSelectedIndex: noop,
    moveSelectionUp: noopBool,
    moveSelectionDown: noopBool,
    openDetail: noop,
    closeDetail: noop,
    markRead: noop,
    setFooterFocused: noop,
    ...actions,
  };
  return (
    <BackgroundAgentViewStateContext.Provider value={state}>
      <BackgroundAgentViewActionsContext.Provider value={mergedActions}>
        {children}
      </BackgroundAgentViewActionsContext.Provider>
    </BackgroundAgentViewStateContext.Provider>
  );
}
