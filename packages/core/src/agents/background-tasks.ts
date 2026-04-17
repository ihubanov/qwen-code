/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview BackgroundTaskRegistry — tracks background (async) sub-agents.
 *
 * When the Agent tool is called with `run_in_background: true`, the sub-agent
 * runs asynchronously. This registry tracks the lifecycle of each background
 * agent so the parent can be notified on completion.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('BACKGROUND_TASKS');

const MAX_DESCRIPTION_LENGTH = 40;
const MAX_RESULT_LENGTH = 2000;
const MAX_RECENT_ACTIVITIES = 5;

/**
 * Produces the human-facing label for an entry — `subagentType: desc`
 * with a redundant prefix stripped and the description truncated to
 * MAX_DESCRIPTION_LENGTH. Single source of truth shared by the
 * notification payload (model-facing) and the TUI dialog (user-facing)
 * so the two surfaces never drift.
 */
export function buildBackgroundEntryLabel(entry: {
  description: string;
  subagentType?: string;
}): string {
  let raw = entry.description;
  if (
    entry.subagentType &&
    raw.toLowerCase().startsWith(entry.subagentType.toLowerCase() + ':')
  ) {
    raw = raw.slice(entry.subagentType.length + 1).trimStart();
  }
  const truncated =
    raw.length > MAX_DESCRIPTION_LENGTH
      ? raw.slice(0, MAX_DESCRIPTION_LENGTH - 1) + '\u2026'
      : raw;
  return entry.subagentType ? `${entry.subagentType}: ${truncated}` : truncated;
}

// Escape text so it is safe to interpolate into an XML element body.
// Subagent-produced strings (description, result, error) can contain `<`,
// `>`, or literal `</task-notification>` — without escaping, a subagent
// summarizing HTML or another agent's notification could close the
// envelope early and forge sibling tags (e.g. a faked <status>) that the
// parent model would treat as trusted metadata.
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type BackgroundAgentStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Statuses where the agent is done. Adding a new terminal status only
 * requires an edit here — UI consumers (unread tracking, etc.) read
 * from this set. */
export const BACKGROUND_TERMINAL_STATUSES: ReadonlySet<BackgroundAgentStatus> =
  new Set<BackgroundAgentStatus>(['completed', 'failed', 'cancelled']);

export interface AgentCompletionStats {
  totalTokens: number;
  toolUses: number;
  durationMs: number;
}

/**
 * A compact record of a recent tool invocation — drives the Progress
 * section of the detail dialog. The Agent tool maintains a rolling
 * buffer of these on each background entry by subscribing to the
 * subagent's event emitter.
 */
export interface BackgroundActivity {
  /** Tool name (e.g. `Bash`, `Read`). */
  name: string;
  /** Short one-line description — the tool's own render-friendly summary. */
  description: string;
  /** Emission timestamp (ms). */
  at: number;
}

export interface BackgroundAgentEntry {
  agentId: string;
  description: string;
  subagentType?: string;
  status: BackgroundAgentStatus;
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  abortController: AbortController;
  stats?: AgentCompletionStats;
  toolUseId?: string;
  /**
   * The original user-supplied prompt for the background task. Surfaced
   * verbatim in the detail dialog's Prompt section. Optional because
   * resume-restored entries may not have it.
   */
  prompt?: string;
  /**
   * Rolling buffer (newest last, capped at MAX_RECENT_ACTIVITIES) of
   * recent tool invocations by this agent. Feeds the detail dialog's
   * Progress section. Replaced as a new array each time an activity is
   * appended so reference-based change detection works. Optional:
   * callers may register without providing it, and `appendActivity`
   * initializes the array lazily.
   */
  recentActivities?: readonly BackgroundActivity[];
}

export interface NotificationMeta {
  agentId: string;
  status: BackgroundAgentStatus;
  stats?: AgentCompletionStats;
  toolUseId?: string;
}

export type BackgroundNotificationCallback = (
  displayText: string,
  modelText: string,
  meta: NotificationMeta,
) => void;

export type BackgroundRegisterCallback = (entry: BackgroundAgentEntry) => void;

/**
 * Fires on entry status transitions — register, complete, fail, cancel.
 * Intentionally does NOT fire on `appendActivity` so consumers that only
 * care about the pill / roster (Footer, AppContainer) don't re-render
 * on every tool call a background agent makes.
 */
export type BackgroundStatusChangeCallback = (
  entry: BackgroundAgentEntry,
) => void;

/** Fires on `appendActivity` — scoped to detail-view consumers. */
export type BackgroundActivityChangeCallback = (
  entry: BackgroundAgentEntry,
) => void;

export class BackgroundTaskRegistry {
  private readonly agents = new Map<string, BackgroundAgentEntry>();
  private notificationCallback?: BackgroundNotificationCallback;
  private registerCallback?: BackgroundRegisterCallback;
  private statusChangeCallback?: BackgroundStatusChangeCallback;
  private activityChangeCallback?: BackgroundActivityChangeCallback;

  register(entry: BackgroundAgentEntry): void {
    this.agents.set(entry.agentId, entry);
    debugLogger.info(`Registered background agent: ${entry.agentId}`);

    if (this.registerCallback) {
      try {
        this.registerCallback(entry);
      } catch (error) {
        debugLogger.error('Failed to emit register callback:', error);
      }
    }
    this.emitStatusChange(entry);
  }

  // No-op if not 'running' — guards against race with concurrent cancellation.
  complete(
    agentId: string,
    result: string,
    stats?: AgentCompletionStats,
  ): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.status !== 'running') return;

    entry.status = 'completed';
    entry.endTime = Date.now();
    entry.result = result;
    entry.stats = stats;
    debugLogger.info(`Background agent completed: ${agentId}`);

    this.emitNotification(entry);
    this.emitStatusChange(entry);
  }

  // No-op if not 'running' — guards against race with concurrent cancellation.
  fail(agentId: string, error: string, stats?: AgentCompletionStats): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.status !== 'running') return;

    entry.status = 'failed';
    entry.endTime = Date.now();
    entry.error = error;
    entry.stats = stats;
    debugLogger.info(`Background agent failed: ${agentId}`);

    this.emitNotification(entry);
    this.emitStatusChange(entry);
  }

  // Emit the terminal notification here — the fire-and-forget complete()/fail()
  // path is guarded by `status !== 'running'` and will no-op, so without this the
  // SDK contract breaks: consumers saw task_started but never receive a matching
  // task_notification.
  cancel(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.status !== 'running') return;

    entry.abortController.abort();
    entry.status = 'cancelled';
    entry.endTime = Date.now();
    debugLogger.info(`Background agent cancelled: ${agentId}`);

    this.emitNotification(entry);
    this.emitStatusChange(entry);
  }

  /**
   * Append a recent tool activity to a running entry's rolling buffer.
   * No-op if the entry is not running — late events after a cancellation
   * shouldn't leak into the Progress section.
   */
  appendActivity(agentId: string, activity: BackgroundActivity): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.status !== 'running') return;

    const prior = entry.recentActivities ?? [];
    const next = [...prior, activity];
    if (next.length > MAX_RECENT_ACTIVITIES) {
      next.splice(0, next.length - MAX_RECENT_ACTIVITIES);
    }
    entry.recentActivities = next;
    this.emitActivityChange(entry);
  }

  get(agentId: string): BackgroundAgentEntry | undefined {
    return this.agents.get(agentId);
  }

  getRunning(): BackgroundAgentEntry[] {
    return Array.from(this.agents.values()).filter(
      (e) => e.status === 'running',
    );
  }

  /**
   * Snapshot of every entry regardless of status. Used by the TUI
   * footer to render rows for still-running AND terminal-state agents;
   * the running-only `getRunning` view is kept for the SDK paths where
   * completed entries are already surfaced via task_notification.
   */
  getAll(): BackgroundAgentEntry[] {
    return Array.from(this.agents.values());
  }

  setNotificationCallback(
    cb: BackgroundNotificationCallback | undefined,
  ): void {
    this.notificationCallback = cb;
  }

  setRegisterCallback(cb: BackgroundRegisterCallback | undefined): void {
    this.registerCallback = cb;
  }

  setStatusChangeCallback(
    cb: BackgroundStatusChangeCallback | undefined,
  ): void {
    this.statusChangeCallback = cb;
  }

  setActivityChangeCallback(
    cb: BackgroundActivityChangeCallback | undefined,
  ): void {
    this.activityChangeCallback = cb;
  }

  abortAll(): void {
    for (const entry of Array.from(this.agents.values())) {
      this.cancel(entry.agentId);
    }
    debugLogger.info('Aborted all background agents');
  }

  private buildDisplayLabel(entry: BackgroundAgentEntry): string {
    return buildBackgroundEntryLabel(entry);
  }

  private emitNotification(entry: BackgroundAgentEntry): void {
    if (!this.notificationCallback) return;

    const statusText =
      entry.status === 'completed'
        ? 'completed'
        : entry.status === 'failed'
          ? 'failed'
          : 'was cancelled';

    const label = this.buildDisplayLabel(entry);
    const displayLine = `Background agent "${label}" ${statusText}.`;

    // Truncate before escaping so we don't slice through an escape
    // sequence (e.g. mid-`&amp;`) and emit malformed XML.
    const rawResult = entry.result
      ? entry.result.length > MAX_RESULT_LENGTH
        ? entry.result.slice(0, MAX_RESULT_LENGTH) + '\n[truncated]'
        : entry.result
      : undefined;

    const xmlParts: string[] = [
      '<task-notification>',
      `<task-id>${escapeXml(entry.agentId)}</task-id>`,
    ];
    if (entry.toolUseId) {
      xmlParts.push(`<tool-use-id>${escapeXml(entry.toolUseId)}</tool-use-id>`);
    }
    xmlParts.push(
      `<status>${escapeXml(entry.status)}</status>`,
      `<summary>Agent "${escapeXml(entry.description)}" ${statusText}.</summary>`,
    );
    if (rawResult) {
      xmlParts.push(`<result>${escapeXml(rawResult)}</result>`);
    }
    if (entry.error) {
      xmlParts.push(`<result>Error: ${escapeXml(entry.error)}</result>`);
    }
    if (entry.stats) {
      xmlParts.push(
        '<usage>',
        `<total_tokens>${entry.stats.totalTokens}</total_tokens>`,
        `<tool_uses>${entry.stats.toolUses}</tool_uses>`,
        `<duration_ms>${entry.stats.durationMs}</duration_ms>`,
        '</usage>',
      );
    }
    xmlParts.push('</task-notification>');

    const meta: NotificationMeta = {
      agentId: entry.agentId,
      status: entry.status,
      stats: entry.stats,
      toolUseId: entry.toolUseId,
    };

    try {
      this.notificationCallback(displayLine, xmlParts.join('\n'), meta);
    } catch (error) {
      debugLogger.error('Failed to emit background notification:', error);
    }
  }

  private emitStatusChange(entry: BackgroundAgentEntry): void {
    if (!this.statusChangeCallback) return;
    try {
      this.statusChangeCallback(entry);
    } catch (error) {
      debugLogger.error('Failed to emit background status change:', error);
    }
  }

  private emitActivityChange(entry: BackgroundAgentEntry): void {
    if (!this.activityChangeCallback) return;
    try {
      this.activityChangeCallback(entry);
    } catch (error) {
      debugLogger.error('Failed to emit background activity change:', error);
    }
  }
}
