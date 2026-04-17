/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef } from 'react';
import { Box } from 'ink';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { BtwMessage } from '../components/messages/BtwMessage.js';
import { AgentTabBar } from '../components/agent-view/AgentTabBar.js';
import { AgentChatView } from '../components/agent-view/AgentChatView.js';
import { AgentComposer } from '../components/agent-view/AgentComposer.js';
import { BackgroundTasksFooter } from '../components/background-view/BackgroundTasksFooter.js';
import { BackgroundTaskDetailView } from '../components/background-view/BackgroundTaskDetailView.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useAgentViewState } from '../contexts/AgentViewContext.js';
import { useBackgroundAgentViewState } from '../contexts/BackgroundAgentViewContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

// Below this height, the detail view takes over the whole viewport
// instead of stacking under the parent conversation — a split squeezes
// the parent into uselessness on short terminals.
const DETAIL_SPLIT_MIN_ROWS = 30;

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const { refreshStatic } = useUIActions();
  const { activeView, agents } = useAgentViewState();
  const { entries: bgEntries, detailOpenFor } = useBackgroundAgentViewState();
  const { columns: terminalWidth, rows: terminalRows } = useTerminalSize();
  const hasAgents = agents.size > 0;
  const hasBgAgents = bgEntries.length > 0;
  const isAgentTab = activeView !== 'main' && agents.has(activeView);

  // Responsive decision for the background detail overlay.
  const bgDetailOpen = !!detailOpenFor;
  const bgDetailFullSwap = bgDetailOpen && terminalRows < DETAIL_SPLIT_MIN_ROWS;

  // Clear terminal on view switch so previous view's <Static> output
  // is removed. refreshStatic clears the terminal and bumps the
  // historyRemountKey so MainContent's <Static> re-renders all items
  // when switching back.
  const prevViewRef = useRef(activeView);
  useEffect(() => {
    if (prevViewRef.current !== activeView) {
      prevViewRef.current = activeView;
      refreshStatic();
    }
  }, [activeView, refreshStatic]);

  // Full-swap: detail view covers the whole viewport, composer and
  // parent conversation are hidden until the user hits Esc.
  if (bgDetailFullSwap) {
    return (
      <Box flexDirection="column" width={terminalWidth}>
        <BackgroundTaskDetailView />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {isAgentTab ? (
        <>
          {/* Agent view: chat history + agent-specific composer */}
          <AgentChatView agentId={activeView} />
          <Box flexDirection="column" ref={uiState.mainControlsRef}>
            <AgentComposer key={activeView} agentId={activeView} />
            <ExitWarning />
          </Box>
        </>
      ) : (
        <>
          {/* Main view: conversation history + main composer / dialogs */}
          <MainContent />
          <Box flexDirection="column" ref={uiState.mainControlsRef}>
            {uiState.dialogsVisible ? (
              <Box
                marginX={2}
                flexDirection="column"
                width={uiState.mainAreaWidth}
              >
                <DialogManager
                  terminalWidth={uiState.terminalWidth}
                  addItem={uiState.historyManager.addItem}
                />
              </Box>
            ) : (
              <>
                {uiState.btwItem && (
                  <Box marginX={2} width={uiState.mainAreaWidth}>
                    <BtwMessage
                      btw={uiState.btwItem.btw}
                      containerWidth={uiState.mainAreaWidth}
                    />
                  </Box>
                )}
                <Composer />
              </>
            )}
            <ExitWarning />
          </Box>
        </>
      )}

      {/* Background agent detail view (split layout). Stacked directly
          below the composer so the parent conversation remains visible
          above. The full-swap branch above handles short terminals. */}
      {bgDetailOpen && <BackgroundTaskDetailView />}

      {/* Background task footer. Hidden while the detail view is open
          (split or full-swap) so the footer doesn't duplicate the row
          whose detail is being shown. */}
      {hasBgAgents && !bgDetailOpen && !uiState.dialogsVisible && (
        <BackgroundTasksFooter />
      )}

      {/* Tab bar: visible whenever in-process agents exist and input is active */}
      {hasAgents && !uiState.dialogsVisible && <AgentTabBar />}
    </Box>
  );
};
