/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview AgentChatView — Arena wrapper around AgentChatContent.
 *
 * Resolves the selected in-process (team/Arena) agent from
 * `AgentViewContext`, owns the Ctrl+F embedded-shell focus toggle, and
 * delegates transcript rendering to `AgentChatContent`.
 *
 * Background agents also render transcripts via `AgentChatContent`, but
 * from a different entry point (`BackgroundTaskDetailView`) that
 * doesn't rely on `AgentViewContext` — the two surfaces share rendering
 * without sharing lookup concerns.
 */

import { useState, useEffect } from 'react';
import { AgentStatus } from '@qwen-code/qwen-code-core';
import {
  useAgentViewState,
  useAgentViewActions,
} from '../../contexts/AgentViewContext.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { AgentChatContent, AgentChatMissing } from './AgentChatContent.js';

interface AgentChatViewProps {
  agentId: string;
}

export const AgentChatView = ({ agentId }: AgentChatViewProps) => {
  const { agents } = useAgentViewState();
  const { setAgentShellFocused } = useAgentViewActions();
  const agent = agents.get(agentId);

  const interactiveAgent = agent?.interactiveAgent;
  const core = interactiveAgent?.getCore();
  const status = interactiveAgent?.getStatus() ?? AgentStatus.INITIALIZING;
  const shellPids = interactiveAgent?.getShellPids();

  // Derive the active PTY PID: first shell PID among currently-executing tools.
  // Resets naturally to undefined when the tool finishes (shellPids cleared).
  const activePtyId =
    shellPids && shellPids.size > 0
      ? (shellPids.values().next().value as number | undefined)
      : undefined;

  // Track whether the user has toggled input focus into the embedded shell.
  // Mirrors the main agent's embeddedShellFocused in AppContainer.
  const [embeddedShellFocused, setEmbeddedShellFocusedLocal] = useState(false);

  // Sync to AgentViewContext so AgentTabBar can suppress arrow-key navigation
  // when an agent's embedded shell is focused.
  useEffect(() => {
    setAgentShellFocused(embeddedShellFocused);
    return () => setAgentShellFocused(false);
  }, [embeddedShellFocused, setAgentShellFocused]);

  // Reset focus when the shell exits (activePtyId disappears).
  useEffect(() => {
    if (!activePtyId) setEmbeddedShellFocusedLocal(false);
  }, [activePtyId]);

  // Ctrl+F: toggle shell input focus when a PTY is active.
  useKeypress(
    (key) => {
      if (key.ctrl && key.name === 'f') {
        if (activePtyId || embeddedShellFocused) {
          setEmbeddedShellFocusedLocal((prev) => !prev);
        }
      }
    },
    { isActive: true },
  );

  if (!agent || !interactiveAgent || !core) {
    return <AgentChatMissing label={`Agent "${agentId}" not found.`} />;
  }

  return (
    <AgentChatContent
      core={core}
      status={status}
      instanceKey={agentId}
      modelName={agent.modelName}
      activePtyId={activePtyId ?? null}
      embeddedShellFocused={embeddedShellFocused}
    />
  );
};
