/**
 * Shared types for MCP server implementation
 */

import { TFile } from 'obsidian';

/**
 * Result of path validation
 */
export interface PathValidationResult {
  valid: boolean;
  error?: string;
  sanitizedPath?: string;
}

/**
 * MCP operation for audit logging and approval
 */
export interface MCPOperation {
  tool: string;
  path?: string;
  action?: string;
  timestamp: number;
  clientId?: string;
  approved?: boolean;
}

/**
 * Audit log entry
 */
export interface AuditEntry {
  timestamp: string;
  type: 'tool_call' | 'resource_read' | 'approval_request' | 'approval_response';
  tool?: string;
  path?: string;
  clientId?: string;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Search result from QMD
 */
export interface SearchResult {
  path: string;
  score: number;
  snippet: string;
  title: string;
  highlights?: string[];
}

/**
 * Search options for QMD
 */
export interface SearchOptions {
  mode?: 'hybrid' | 'semantic' | 'keyword';
  limit?: number;
  folder?: string;
  tags?: string[];
}

/**
 * Parsed task from Obsidian Tasks format
 */
export interface ParsedTask {
  id: string;
  description: string;
  completed: boolean;
  dueDate?: string;
  scheduledDate?: string;
  startDate?: string;
  doneDate?: string;
  priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
  recurrence?: string;
  tags: string[];
  filePath: string;
  lineNumber: number;
  rawLine: string;
}

/**
 * Task query options
 */
export interface TaskQuery {
  status?: 'incomplete' | 'complete' | 'all';
  dueBefore?: string;
  dueAfter?: string;
  overdue?: boolean;
  priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
  tags?: string[];
  inNote?: string;
  limit?: number;
}

/**
 * Task creation data
 */
export interface TaskData {
  description: string;
  dueDate?: string;
  scheduledDate?: string;
  startDate?: string;
  priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
  recurrence?: string;
  tags?: string[];
}

/**
 * Note metadata
 */
export interface NoteMetadata {
  path: string;
  name: string;
  basename: string;
  extension: string;
  size: number;
  created: number;
  modified: number;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Transport options
 */
export interface TransportOptions {
  port?: number;
  host?: string;
}

/**
 * MCP tool response
 */
export interface ToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Pending approval operation
 */
export interface PendingApproval {
  id: string;
  operation: MCPOperation;
  resolve: (approved: boolean) => void;
  timeout: NodeJS.Timeout;
}
