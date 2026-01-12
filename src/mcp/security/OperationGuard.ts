/**
 * Operation approval system for MCP write operations
 *
 * Shows user prompts for file writes and other destructive operations.
 */

import { Notice, Modal, App, Setting } from 'obsidian';
import { MCPOperation, PendingApproval } from '../types';
import { AuditLogger } from './AuditLogger';
import type { ObsidianCCSettings } from '../../settings/SettingsSchema';

/**
 * Tools that require approval when requireApproval is enabled
 */
const WRITE_TOOLS = [
  'write_note',
  'add_task',
  'complete_task',
];

export class OperationGuard {
  private settings: ObsidianCCSettings;
  private app: App;
  private auditLogger: AuditLogger;
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private approvalTimeout = 30000; // 30 seconds

  constructor(app: App, settings: ObsidianCCSettings, auditLogger: AuditLogger) {
    this.app = app;
    this.settings = settings;
    this.auditLogger = auditLogger;
  }

  /**
   * Check if operation requires approval
   */
  requiresApproval(operation: MCPOperation): boolean {
    if (!this.settings.requireApproval) {
      return false;
    }
    return WRITE_TOOLS.includes(operation.tool);
  }

  /**
   * Request approval for an operation
   */
  async requestApproval(operation: MCPOperation): Promise<boolean> {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Log the approval request
      this.auditLogger.logApprovalRequest(operation.tool, operation.path, operation.clientId);

      // Set up timeout
      const timeout = setTimeout(() => {
        const pending = this.pendingApprovals.get(id);
        if (pending) {
          this.pendingApprovals.delete(id);
          this.auditLogger.logApprovalResponse(operation.tool, operation.path, false, operation.clientId);
          resolve(false);
        }
      }, this.approvalTimeout);

      // Store pending approval
      this.pendingApprovals.set(id, {
        id,
        operation,
        resolve: (approved: boolean) => {
          clearTimeout(timeout);
          this.pendingApprovals.delete(id);
          this.auditLogger.logApprovalResponse(operation.tool, operation.path, approved, operation.clientId);
          resolve(approved);
        },
        timeout,
      });

      // Show approval modal
      const modal = new ApprovalModal(
        this.app,
        operation,
        (approved) => {
          const pending = this.pendingApprovals.get(id);
          if (pending) {
            pending.resolve(approved);
          }
        }
      );
      modal.open();
    });
  }

  /**
   * Execute operation with optional approval
   */
  async executeWithApproval<T>(
    operation: MCPOperation,
    executor: () => Promise<T>
  ): Promise<T> {
    if (this.requiresApproval(operation)) {
      const approved = await this.requestApproval(operation);
      if (!approved) {
        throw new Error('Operation denied by user');
      }
    }
    return executor();
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: ObsidianCCSettings): void {
    this.settings = settings;
  }

  /**
   * Cancel all pending approvals
   */
  cancelAll(): void {
    for (const [, pending] of this.pendingApprovals) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingApprovals.clear();
  }
}

/**
 * Modal for approval requests
 */
class ApprovalModal extends Modal {
  private operation: MCPOperation;
  private callback: (approved: boolean) => void;
  private responded = false;

  constructor(app: App, operation: MCPOperation, callback: (approved: boolean) => void) {
    super(app);
    this.operation = operation;
    this.callback = callback;
  }

  /**
   * Respond to approval request (prevents double callbacks)
   */
  private respond(approved: boolean): void {
    if (this.responded) return;
    this.responded = true;
    this.callback(approved);
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'MCP Operation Approval' });

    const toolName = this.operation.tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    contentEl.createEl('p', {
      text: `Claude Code is requesting permission to perform the following operation:`,
    });

    const detailsEl = contentEl.createEl('div', { cls: 'mcp-approval-details' });

    detailsEl.createEl('div', {
      cls: 'mcp-approval-row',
      text: `Tool: ${toolName}`,
    });

    if (this.operation.path) {
      detailsEl.createEl('div', {
        cls: 'mcp-approval-row',
        text: `Path: ${this.operation.path}`,
      });
    }

    if (this.operation.action) {
      detailsEl.createEl('div', {
        cls: 'mcp-approval-row',
        text: `Action: ${this.operation.action}`,
      });
    }

    contentEl.createEl('p', {
      text: 'Do you want to allow this operation?',
      cls: 'mcp-approval-question',
    });

    // Buttons
    const buttonContainer = contentEl.createEl('div', { cls: 'mcp-approval-buttons' });

    const denyButton = buttonContainer.createEl('button', {
      text: 'Deny',
      cls: 'mod-warning',
    });
    denyButton.addEventListener('click', () => this.respond(false));

    const allowButton = buttonContainer.createEl('button', {
      text: 'Allow',
      cls: 'mod-cta',
    });
    allowButton.addEventListener('click', () => this.respond(true));

    // Focus allow button for quick approval
    allowButton.focus();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    // If modal closed without responding, deny by default
    if (!this.responded) {
      this.responded = true;
      this.callback(false);
    }
  }
}
