/**
 * Audit logging for MCP operations
 *
 * Logs all MCP tool calls and resource accesses for security review.
 */

import { AuditEntry } from '../types';
import type { ObsidianCCSettings } from '../../settings/SettingsSchema';

export class AuditLogger {
  private settings: ObsidianCCSettings;
  private logs: AuditEntry[] = [];
  private maxLogSize = 1000;

  constructor(settings: ObsidianCCSettings) {
    this.settings = settings;
  }

  /**
   * Log an audit event
   */
  log(event: Omit<AuditEntry, 'timestamp'>): void {
    if (!this.settings.auditLogging) {
      return;
    }

    const entry: AuditEntry = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Add to in-memory log
    this.logs.push(entry);

    // Trim if too large
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize);
    }

    // Console log for debugging
    if (this.settings.debugMode) {
      console.log('[MCP Audit]', JSON.stringify(entry, null, 2));
    }
  }

  /**
   * Log a tool call
   */
  logToolCall(
    tool: string,
    path: string | undefined,
    success: boolean,
    error?: string,
    clientId?: string
  ): void {
    this.log({
      type: 'tool_call',
      tool,
      path,
      clientId,
      success,
      error,
    });
  }

  /**
   * Log a resource read
   */
  logResourceRead(
    path: string,
    success: boolean,
    error?: string,
    clientId?: string
  ): void {
    this.log({
      type: 'resource_read',
      path,
      clientId,
      success,
      error,
    });
  }

  /**
   * Log an approval request
   */
  logApprovalRequest(
    tool: string,
    path: string | undefined,
    clientId?: string
  ): void {
    this.log({
      type: 'approval_request',
      tool,
      path,
      clientId,
      success: true, // Request was made
    });
  }

  /**
   * Log an approval response
   */
  logApprovalResponse(
    tool: string,
    path: string | undefined,
    approved: boolean,
    clientId?: string
  ): void {
    this.log({
      type: 'approval_response',
      tool,
      path,
      clientId,
      success: approved,
      details: { approved },
    });
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 50): AuditEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs for a specific tool
   */
  getLogsForTool(tool: string, count = 50): AuditEntry[] {
    return this.logs
      .filter((entry) => entry.tool === tool)
      .slice(-count);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: ObsidianCCSettings): void {
    this.settings = settings;
  }
}
