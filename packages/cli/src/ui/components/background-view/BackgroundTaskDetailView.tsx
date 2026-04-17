/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview BackgroundTaskDetailView — read-only transcript pane
 * for a selected background agent.
 *
 * Shows the selected entry's full chat (via `AgentChatContent` with
 * `readonly` set). Installs an Escape keybinding to close and return
 * focus to the footer. Whether this pane is stacked above the parent
 * conversation (split view) or takes over the viewport (full-swap) is
 * decided by the parent layout based on terminal height — this
 * component is just the pane itself.
 */

import { Box, Text } from 'ink';
import type { AgentStatus } from '@qwen-code/qwen-code-core';
import {
  useBackgroundAgentViewState,
  useBackgroundAgentViewActions,
} from '../../contexts/BackgroundAgentViewContext.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { AgentChatContent } from '../agent-view/AgentChatContent.js';

export const BackgroundTaskDetailView: React.FC = () => {
  const { entries, detailOpenFor } = useBackgroundAgentViewState();
  const { closeDetail, setFooterFocused } = useBackgroundAgentViewActions();

  // Escape returns to main; always installed while the detail view is
  // mounted. Does NOT abort the underlying agent (session-level only).
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        closeDetail();
        setFooterFocused(true);
      }
    },
    { isActive: true },
  );

  if (!detailOpenFor) return null;
  const entry = entries.find((e) => e.agentId === detailOpenFor);
  if (!entry) {
    // Entry no longer in the registry (defensive — shouldn't happen
    // since entries never leave the session-scoped registry). Render
    // a stub + keep the Esc hint visible.
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.status.error}>
          Background agent &quot;{detailOpenFor}&quot; is no longer available.
        </Text>
        <Text color={theme.text.secondary}>{'  esc return'}</Text>
      </Box>
    );
  }

  const headerLabel = entry.subagentType
    ? `${entry.subagentType}: ${entry.description}`
    : entry.description;

  return (
    <Box flexDirection="column">
      {/* Separator / header line for the detail pane. */}
      <Box
        paddingX={1}
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
      >
        <Text color={theme.text.primary} bold>
          {headerLabel}
        </Text>
        <Text color={theme.text.secondary}>{'   esc return'}</Text>
      </Box>

      {entry.core ? (
        <AgentChatContent
          core={entry.core}
          status={entry.status as AgentStatus}
          instanceKey={entry.agentId}
          modelName={entry.subagentType}
          readonly={true}
        />
      ) : (
        <Box paddingX={2} paddingY={1}>
          <Text color={theme.text.secondary}>
            {'Waiting for agent to start\u2026'}
          </Text>
        </Box>
      )}
    </Box>
  );
};
