/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BackgroundTasksDialog — single overlay with two modes:
 *
 * - `list`: section-based roster of background agents. Today only the
 *   "Local agents" section renders (shells are out of scope for this PR
 *   but the section scaffolding can grow to include them). ↑/↓ moves
 *   selection, Enter opens the detail mode, x cancels the selected
 *   entry, ctrl+x ctrl+k cancels every running agent, ←/Esc closes.
 *
 * - `detail`: compact view of the selected entry. Shows
 *   `subagent-type › description`, a stats subtitle (elapsed, tokens,
 *   tool uses), the Progress section (recent tool activities), the
 *   original Prompt, and an Error section when the agent failed.
 *   ← returns to list, Esc/Enter/Space closes, x cancels the agent when
 *   still running.
 *
 * The dialog assumes it is only mounted when `dialogOpen === true` and
 * deactivates the composer's key handling while active via the existing
 * `bgDialogOpen` branch in InputPrompt.
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  useBackgroundAgentViewState,
  useBackgroundAgentViewActions,
} from '../../contexts/BackgroundAgentViewContext.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import type { BackgroundAgentEntry } from '@qwen-code/qwen-code-core';

const MAX_LABEL_LENGTH = 40;

function statusSuffix(entry: BackgroundAgentEntry): string {
  switch (entry.status) {
    case 'running':
      return '(running)';
    case 'completed':
      return '(done)';
    case 'failed':
      return '(failed)';
    case 'cancelled':
      return '(stopped)';
    default:
      return '';
  }
}

function rowLabel(entry: BackgroundAgentEntry): string {
  let raw = entry.description ?? '';
  if (
    entry.subagentType &&
    raw.toLowerCase().startsWith(entry.subagentType.toLowerCase() + ':')
  ) {
    raw = raw.slice(entry.subagentType.length + 1).trimStart();
  }
  return raw.length > MAX_LABEL_LENGTH
    ? raw.slice(0, MAX_LABEL_LENGTH - 1) + '\u2026'
    : raw;
}

function formatElapsed(entry: BackgroundAgentEntry): string {
  const end = entry.endTime ?? Date.now();
  const ms = Math.max(0, end - entry.startTime);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k tokens`;
  }
  return `${n} tokens`;
}

// ─── List mode ─────────────────────────────────────────────

const ListBody: React.FC<{
  entries: readonly BackgroundAgentEntry[];
  selectedIndex: number;
}> = ({ entries, selectedIndex }) => {
  if (entries.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={theme.text.secondary}>No tasks currently running</Text>
      </Box>
    );
  }

  const running = entries.filter((e) => e.status === 'running').length;

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color={theme.text.secondary}>
          {running} active {running === 1 ? 'agent' : 'agents'}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Box paddingX={1}>
          <Text bold>Local agents</Text>
          <Text color={theme.text.secondary}> ({entries.length})</Text>
        </Box>
        {entries.map((entry, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={entry.agentId} flexDirection="row" paddingX={1}>
              <Box width={2}>
                <Text color={isSelected ? theme.border.focused : undefined}>
                  {isSelected ? '\u203A ' : '  '}
                </Text>
              </Box>
              <Text
                color={
                  entry.status === 'running'
                    ? theme.text.primary
                    : theme.text.secondary
                }
                bold={isSelected}
              >
                {rowLabel(entry)}
              </Text>
              <Text color={theme.text.secondary}> {statusSuffix(entry)}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// ─── Detail mode ───────────────────────────────────────────

const DetailBody: React.FC<{ entry: BackgroundAgentEntry }> = ({ entry }) => {
  const title = `${entry.subagentType ?? 'Agent'} \u203A ${rowLabel(entry)}`;

  const subtitleParts: string[] = [];
  if (entry.status !== 'running') {
    subtitleParts.push(
      entry.status === 'completed'
        ? 'Completed'
        : entry.status === 'failed'
          ? 'Failed'
          : 'Stopped',
    );
  }
  subtitleParts.push(formatElapsed(entry));
  if (entry.stats?.totalTokens) {
    subtitleParts.push(formatTokens(entry.stats.totalTokens));
  }
  if (entry.stats?.toolUses !== undefined) {
    subtitleParts.push(
      `${entry.stats.toolUses} tool${entry.stats.toolUses === 1 ? '' : 's'}`,
    );
  }

  const activities = entry.recentActivities ?? [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={theme.text.accent}>
        {title}
      </Text>
      <Text color={theme.text.secondary}>{subtitleParts.join(' \u00B7 ')}</Text>

      {activities.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Progress</Text>
          {activities
            .slice()
            .reverse()
            .map((a, i) => (
              <Text key={`${a.at}-${i}`}>
                <Text color={theme.text.secondary}>
                  {i === 0 ? '\u203A ' : '  '}
                </Text>
                <Text>{a.name}</Text>
                {a.description ? (
                  <Text color={theme.text.secondary}> {a.description}</Text>
                ) : null}
              </Text>
            ))}
        </Box>
      )}

      {entry.prompt && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Prompt</Text>
          <Text wrap="wrap">{entry.prompt}</Text>
        </Box>
      )}

      {entry.status === 'failed' && entry.error && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.status.error}>
            Error
          </Text>
          <Text color={theme.status.error} wrap="wrap">
            {entry.error}
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ─── Dialog shell ──────────────────────────────────────────

export const BackgroundTasksDialog: React.FC = () => {
  const { entries, selectedIndex, dialogOpen, dialogMode } =
    useBackgroundAgentViewState();
  const {
    moveSelectionUp,
    moveSelectionDown,
    openDialog: _openDialog,
    closeDialog,
    enterDetail,
    exitDetail,
  } = useBackgroundAgentViewActions();
  const config = useConfig();

  const selectedEntry = useMemo(
    () => entries[selectedIndex] ?? null,
    [entries, selectedIndex],
  );

  useKeypress(
    (key) => {
      if (!dialogOpen) return;

      if (dialogMode === 'list') {
        if (key.name === 'up') {
          moveSelectionUp();
          return;
        }
        if (key.name === 'down') {
          moveSelectionDown();
          return;
        }
        if (key.name === 'return') {
          if (selectedEntry) enterDetail();
          return;
        }
        if (key.name === 'escape' || key.name === 'left') {
          closeDialog();
          return;
        }
        if (key.sequence === 'x' && !key.ctrl && !key.meta) {
          if (selectedEntry?.status === 'running') {
            try {
              config.getBackgroundTaskRegistry().cancel(selectedEntry.agentId);
            } catch {
              // registry missing → ignore; the dialog will remain open
            }
          }
          return;
        }
        // Note: the "stop all agents" chord (ctrl+x ctrl+k in claw-code)
        // is intentionally deferred. `useKeypress` fires per keystroke,
        // so collapsing the chord to plain ctrl+k makes a destructive
        // action too easy to trigger by mistake. Stop-all will land in
        // a follow-up PR once proper chord handling is in place.
        return;
      }

      // detail mode
      if (key.name === 'left') {
        exitDetail();
        return;
      }
      if (
        key.name === 'escape' ||
        key.name === 'return' ||
        key.name === 'space'
      ) {
        closeDialog();
        return;
      }
      if (key.sequence === 'x' && !key.ctrl && !key.meta) {
        if (selectedEntry?.status === 'running') {
          try {
            config.getBackgroundTaskRegistry().cancel(selectedEntry.agentId);
          } catch {
            /* ignore */
          }
        }
        return;
      }
    },
    { isActive: dialogOpen },
  );

  if (!dialogOpen) return null;

  // Hint footer — context-sensitive.
  const hints: string[] = [];
  if (dialogMode === 'list') {
    hints.push('\u2191/\u2193 select', 'Enter view');
    if (selectedEntry?.status === 'running') hints.push('x stop');
    hints.push('\u2190/Esc close');
  } else {
    hints.push('\u2190 go back', 'Esc/Enter/Space close');
    if (selectedEntry?.status === 'running') hints.push('x stop');
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      marginTop={1}
      paddingX={1}
    >
      <Box paddingX={1}>
        <Text bold color={theme.text.accent}>
          Background tasks
        </Text>
      </Box>
      <Box marginTop={1}>
        {dialogMode === 'list' ? (
          <ListBody entries={entries} selectedIndex={selectedIndex} />
        ) : selectedEntry ? (
          <DetailBody entry={selectedEntry} />
        ) : (
          <Box paddingX={1}>
            <Text color={theme.text.secondary}>No entry to show.</Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1} paddingX={1}>
        <Text color={theme.text.secondary}>{hints.join(' \u00B7 ')}</Text>
      </Box>
    </Box>
  );
};
