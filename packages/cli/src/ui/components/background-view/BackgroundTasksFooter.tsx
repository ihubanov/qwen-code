/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview BackgroundTasksFooter — stacked list of background agents.
 *
 * One row per `BackgroundAgentEntry`, rendered directly below the
 * composer. Shows a status glyph, the agent's subagent-type + truncated
 * description, and a trailing unread marker (`·`) for terminal-state
 * entries the user has not yet opened in the detail view.
 *
 * Keyboard (when footer has focus):
 *   - Up    : move selection up; at top, release focus back to AgentTabBar
 *             (if present) or Composer.
 *   - Down  : move selection down; no-op at bottom.
 *   - Enter : open the detail view for the selected row.
 *
 * The footer is visible whenever at least one background agent entry
 * exists. Visibility is decided by the parent layout via
 * `useBackgroundAgentViewState().entries.length`.
 */

import { Box, Text } from 'ink';
import { useContext } from 'react';
import {
  useBackgroundAgentViewState,
  useBackgroundAgentViewActions,
} from '../../contexts/BackgroundAgentViewContext.js';
import {
  useAgentViewState,
  useAgentViewActions,
} from '../../contexts/AgentViewContext.js';
import { UIStateContext } from '../../contexts/UIStateContext.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { theme } from '../../semantic-colors.js';
import type { BackgroundAgentEntry } from '@qwen-code/qwen-code-core';

// Status-glyph palette. Mirrored in background-subagent.md section 9
// "Visual state machine (per agent)". Kept as a single source of truth
// so tests / future surfaces can import it.
interface GlyphSpec {
  symbol: string;
  color: string;
}

function glyphFor(entry: BackgroundAgentEntry): GlyphSpec {
  switch (entry.status) {
    case 'running':
      return { symbol: '\u25CF', color: theme.text.primary }; // ●
    case 'completed':
      return { symbol: '\u2713', color: theme.status.success }; // ✓
    case 'failed':
      return { symbol: '\u2717', color: theme.status.error }; // ✗
    case 'cancelled':
      return { symbol: '\u25CB', color: theme.text.secondary }; // ○
    default:
      return { symbol: '\u25CB', color: theme.text.secondary };
  }
}

const MAX_LABEL_LENGTH = 40;

/**
 * Renders the human-facing label for an entry: `subagentType: description`,
 * truncated to MAX_LABEL_LENGTH with an ellipsis. Strips a redundant
 * `subagentType:` prefix inside `description` to avoid
 * `Explore: Explore: foo`.
 */
export function buildEntryLabel(entry: BackgroundAgentEntry): string {
  let raw = entry.description ?? '';
  if (
    entry.subagentType &&
    raw.toLowerCase().startsWith(entry.subagentType.toLowerCase() + ':')
  ) {
    raw = raw.slice(entry.subagentType.length + 1).trimStart();
  }
  const truncated =
    raw.length > MAX_LABEL_LENGTH
      ? raw.slice(0, MAX_LABEL_LENGTH - 1) + '\u2026'
      : raw;
  return entry.subagentType ? `${entry.subagentType}: ${truncated}` : truncated;
}

// ─── Component ──────────────────────────────────────────────

export const BackgroundTasksFooter: React.FC = () => {
  const { entries, selectedIndex, unread, footerFocused } =
    useBackgroundAgentViewState();
  const { moveSelectionUp, moveSelectionDown, openDetail, setFooterFocused } =
    useBackgroundAgentViewActions();

  const agentViewState = useAgentViewState();
  const agentViewActions = useAgentViewActions();
  // Read the UI state context directly rather than via `useUIState`,
  // which throws when no provider is mounted. The footer only needs
  // `embeddedShellFocused` to mute its key handling while a shell has
  // input focus; outside a full app (e.g., in unit tests) that's false
  // by default.
  const uiState = useContext(UIStateContext);
  const embeddedShellFocused = uiState?.embeddedShellFocused ?? false;
  const { rows: terminalRows } = useTerminalSize();

  // Overflow: cap the visible rows to ~1/4 of the terminal height.
  // When the list overflows, reserve the last visible line for the
  // "…and N more" indicator and scroll a window so the selected row is
  // always inside the visible slice — otherwise Enter would open an
  // off-screen task and no row would appear highlighted.
  const rowCap = Math.max(3, Math.floor(terminalRows / 4));
  const overflowing = entries.length > rowCap;
  const windowSize = overflowing ? rowCap - 1 : entries.length;
  const windowStart = overflowing
    ? Math.max(
        0,
        Math.min(
          entries.length - windowSize,
          selectedIndex - Math.floor(windowSize / 2),
        ),
      )
    : 0;
  const visibleRows = entries.slice(windowStart, windowStart + windowSize);
  const overflowCount = overflowing ? entries.length - visibleRows.length : 0;

  useKeypress(
    (key) => {
      if (embeddedShellFocused) return;
      if (agentViewState.agentShellFocused) return;
      if (!footerFocused) return;

      if (key.name === 'up') {
        const moved = moveSelectionUp();
        if (!moved) {
          // At the top of the list — release footer focus and climb up
          // to the AgentTabBar (if any team agents exist) or back to
          // the composer.
          setFooterFocused(false);
          if (agentViewState.agents.size > 0) {
            agentViewActions.setAgentTabBarFocused(true);
          }
        }
      } else if (key.name === 'down') {
        moveSelectionDown();
      } else if (key.name === 'return') {
        openDetail();
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta
      ) {
        // Printable character → release focus so the keystroke can flow
        // through to the composer's input. Mirrors AgentTabBar's
        // behavior for the same situation.
        setFooterFocused(false);
      }
    },
    { isActive: true },
  );

  if (entries.length === 0) return null;

  const hint = footerFocused
    ? '\u2191/\u2193 select  \u21B5 open'
    : '\u2193 tasks';

  return (
    <Box flexDirection="column" paddingX={1}>
      {visibleRows.map((entry, idx) => {
        const absoluteIdx = idx + windowStart;
        const isSelected = footerFocused && absoluteIdx === selectedIndex;
        const isUnread = unread.has(entry.agentId);
        const { symbol, color } = glyphFor(entry);
        const label = buildEntryLabel(entry);

        return (
          <Box key={entry.agentId} flexDirection="row">
            {/* Selection gutter — a leading chevron on the focused row
                so the active selection is visible even when terminals
                drop reverse-video or dim styling. */}
            <Box width={2}>
              <Text color={isSelected ? theme.border.focused : undefined}>
                {isSelected ? '\u203A ' : '  '}
              </Text>
            </Box>

            <Text color={color} inverse={isSelected}>
              {symbol}
            </Text>
            <Text> </Text>
            <Text
              color={
                isSelected
                  ? theme.text.primary
                  : entry.status === 'running'
                    ? theme.text.primary
                    : theme.text.secondary
              }
              inverse={isSelected}
              bold={isSelected}
            >
              {label}
            </Text>
            {isUnread ? (
              <>
                <Text> </Text>
                <Text color={theme.status.success}>{'\u00B7'}</Text>
              </>
            ) : null}
          </Box>
        );
      })}

      {overflowCount > 0 ? (
        <Box>
          <Text color={theme.text.secondary}>
            {`  \u2026and ${overflowCount} more`}
          </Text>
        </Box>
      ) : null}

      <Text color={theme.text.secondary}>{`  ${hint}`}</Text>
    </Box>
  );
};
