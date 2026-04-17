/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview AgentChatContent — presentational transcript renderer.
 *
 * Takes an `AgentCore` plus the agent's current `AgentStatus` and renders
 * the agent's full transcript: header, committed history (Static), live
 * area (tool calls still executing / awaiting confirmation), and spinner.
 *
 * Subscribes to the core's event emitter internally to re-render on new
 * messages, tool calls/results, approval requests, and status changes.
 * Consumers don't need to wire their own listener plumbing.
 *
 * Used by `AgentChatView` for in-process (Arena) agents — passes
 * through the embedded-shell PTY state so Ctrl+F interaction works.
 */

import { Box, Text, Static } from 'ink';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  AgentStatus,
  AgentEventType,
  getGitBranch,
  type AgentCore,
  type AgentStatusChangeEvent,
} from '@qwen-code/qwen-code-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { HistoryItemDisplay } from '../HistoryItemDisplay.js';
import { ToolCallStatus } from '../../types.js';
import { theme } from '../../semantic-colors.js';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';
import { agentMessagesToHistoryItems } from './agentHistoryAdapter.js';
import { AgentHeader } from './AgentHeader.js';

export interface AgentChatContentProps {
  /** The agent's AgentCore — the source of truth for transcript state. */
  core: AgentCore;
  /** The agent's current lifecycle status (drives the spinner). */
  status: AgentStatus;
  /** Stable identifier used for memo keys and the Static remount key. */
  instanceKey: string;
  /** Optional display name shown in the header. */
  modelName?: string;
  /**
   * Active PTY PID for the embedded shell, if any. Only meaningful for
   * Arena (interactive) agents. Pass `null`/omit for read-only surfaces.
   */
  activePtyId?: number | null;
  /**
   * Whether the embedded shell currently has keyboard focus. Only
   * meaningful for Arena agents. Pass `false`/omit for read-only surfaces.
   */
  embeddedShellFocused?: boolean;
  /**
   * When true, tool groups in the live area render without the
   * activePtyId/embeddedShellFocused props so no interactive shell
   * affordance appears. Defaults to `false`.
   */
  readonly?: boolean;
}

export const AgentChatContent = ({
  core,
  status,
  instanceKey,
  modelName,
  activePtyId,
  embeddedShellFocused,
  readonly = false,
}: AgentChatContentProps) => {
  const uiState = useUIState();
  const { historyRemountKey, availableTerminalHeight, constrainHeight } =
    uiState;
  const { columns: terminalWidth } = useTerminalSize();
  const contentWidth = terminalWidth - 4;

  // Force re-render on message updates and status changes.
  // STREAM_TEXT is deliberately excluded — model text is shown only after
  // each round completes (via committed messages), avoiding per-chunk re-renders.
  const [, setRenderTick] = useState(0);
  const tickRef = useRef(0);
  const forceRender = useCallback(() => {
    tickRef.current += 1;
    setRenderTick(tickRef.current);
  }, []);

  useEffect(() => {
    const emitter = core.getEventEmitter();
    if (!emitter) return;

    const onStatusChange = (_event: AgentStatusChangeEvent) => forceRender();
    const onToolCall = () => forceRender();
    const onToolResult = () => forceRender();
    const onRoundEnd = () => forceRender();
    const onApproval = () => forceRender();
    const onOutputUpdate = () => forceRender();
    const onFinish = () => forceRender();

    emitter.on(AgentEventType.STATUS_CHANGE, onStatusChange);
    emitter.on(AgentEventType.TOOL_CALL, onToolCall);
    emitter.on(AgentEventType.TOOL_RESULT, onToolResult);
    emitter.on(AgentEventType.ROUND_END, onRoundEnd);
    emitter.on(AgentEventType.TOOL_WAITING_APPROVAL, onApproval);
    emitter.on(AgentEventType.TOOL_OUTPUT_UPDATE, onOutputUpdate);
    emitter.on(AgentEventType.FINISH, onFinish);

    return () => {
      emitter.off(AgentEventType.STATUS_CHANGE, onStatusChange);
      emitter.off(AgentEventType.TOOL_CALL, onToolCall);
      emitter.off(AgentEventType.TOOL_RESULT, onToolResult);
      emitter.off(AgentEventType.ROUND_END, onRoundEnd);
      emitter.off(AgentEventType.TOOL_WAITING_APPROVAL, onApproval);
      emitter.off(AgentEventType.TOOL_OUTPUT_UPDATE, onOutputUpdate);
      emitter.off(AgentEventType.FINISH, onFinish);
    };
  }, [core, forceRender]);

  const messages = core.getMessages();
  const pendingApprovals = core.getPendingApprovals();
  const liveOutputs = core.getLiveOutputs();
  const shellPids = core.getShellPids();
  const isRunning =
    status === AgentStatus.RUNNING || status === AgentStatus.INITIALIZING;

  // tickRef.current in deps ensures we rebuild when events fire even if
  // messages.length and pendingApprovals.size haven't changed (e.g. a
  // tool result updates an existing entry in place).
  const allItems = useMemo(
    () =>
      agentMessagesToHistoryItems(
        messages,
        pendingApprovals,
        liveOutputs,
        shellPids,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      instanceKey,
      messages.length,
      pendingApprovals.size,
      liveOutputs.size,
      shellPids.size,
      tickRef.current,
    ],
  );

  // Any tool_group with an Executing or Confirming tool — plus everything
  // after it — stays in the live area so confirmation dialogs remain
  // interactive (Ink's <Static> cannot receive input).
  const splitIndex = useMemo(() => {
    for (let idx = allItems.length - 1; idx >= 0; idx--) {
      const item = allItems[idx]!;
      if (
        item.type === 'tool_group' &&
        item.tools.some(
          (t) =>
            t.status === ToolCallStatus.Executing ||
            t.status === ToolCallStatus.Confirming,
        )
      ) {
        return idx;
      }
    }
    return allItems.length;
  }, [allItems]);

  const committedItems = allItems.slice(0, splitIndex);
  const pendingItems = allItems.slice(splitIndex);

  const agentWorkingDir = core.runtimeContext.getTargetDir() ?? '';
  // Cache the branch — it won't change during the agent's lifetime and
  // getGitBranch uses synchronous execSync which blocks the render loop.
  const agentGitBranch = useMemo(
    () => (agentWorkingDir ? getGitBranch(agentWorkingDir) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instanceKey],
  );

  const agentModelId = core.modelConfig.model ?? '';

  // readonly surfaces never expose the embedded shell; pass undefined
  // so HistoryItemDisplay doesn't render shell-input affordances.
  const renderedActivePtyId = readonly ? null : (activePtyId ?? null);
  const renderedEmbeddedShellFocused = readonly
    ? false
    : (embeddedShellFocused ?? false);

  return (
    <Box flexDirection="column">
      {/* Committed message history.
          key includes historyRemountKey: when refreshStatic() clears the
          terminal it bumps the key, forcing Static to remount and re-emit
          all items on the cleared screen. */}
      <Static
        key={`agent-${instanceKey}-${historyRemountKey}`}
        items={[
          <AgentHeader
            key="agent-header"
            modelId={agentModelId}
            modelName={modelName}
            workingDirectory={agentWorkingDir}
            gitBranch={agentGitBranch}
          />,
          ...committedItems.map((item) => (
            <HistoryItemDisplay
              key={item.id}
              item={item}
              isPending={false}
              terminalWidth={terminalWidth}
              mainAreaWidth={contentWidth}
            />
          )),
        ]}
      >
        {(item) => item}
      </Static>

      {/* Live area — tool groups awaiting confirmation or still executing.
          Must remain outside Static so confirmation dialogs are interactive. */}
      {pendingItems.map((item) => (
        <HistoryItemDisplay
          key={item.id}
          item={item}
          isPending={true}
          terminalWidth={terminalWidth}
          mainAreaWidth={contentWidth}
          availableTerminalHeight={
            constrainHeight ? availableTerminalHeight : undefined
          }
          isFocused={!readonly}
          activeShellPtyId={renderedActivePtyId}
          embeddedShellFocused={renderedEmbeddedShellFocused}
        />
      ))}

      {/* Spinner */}
      {isRunning && (
        <Box marginX={2} marginTop={1}>
          <GeminiRespondingSpinner />
        </Box>
      )}
    </Box>
  );
};

// Re-exported helper for consumers that render an error panel when the
// backing agent/core isn't available (e.g. a race where the registry
// entry exists but `core` hasn't been attached yet).
export const AgentChatMissing = ({ label }: { label: string }) => (
  <Box marginX={2}>
    <Text color={theme.status.error}>{label}</Text>
  </Box>
);
