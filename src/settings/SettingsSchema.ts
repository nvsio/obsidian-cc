/**
 * Obsidian CC Settings Schema
 * Defines all plugin configuration options
 */

export interface ObsidianCCSettings {
  // Backend Configuration
  agenticBackend: 'sdk' | 'cli';
  model: string;
  maxTokens: number;
  temperature: number;

  // Claude Code Integration
  claudeCodeIntegration: boolean;
  autoUpdateClaudeMd: boolean;
  mcpServerEnabled: boolean;
  mcpServerPort: number;

  // @ Trigger Configuration
  inlineEnabled: boolean;
  agenticEnabled: boolean;
  inlineTrigger: string;
  agenticTrigger: string;

  // QMD Configuration
  qmdEnabled: boolean;
  qmdPath: string;
  autoIndex: boolean;
  searchMode: 'hybrid' | 'semantic' | 'keyword';
  maxSearchResults: number;

  // Tasks Integration
  tasksIntegration: boolean;
  taskFormat: 'obsidian-tasks' | 'dataview' | 'basic';

  // GitHub Configuration
  defaultClonePath: string;

  // Security Settings
  requireApproval: boolean;
  auditLogging: boolean;

  // Advanced
  debugMode: boolean;
  customSystemPrompt: string;
  timeout: number;
}

export const DEFAULT_SETTINGS: ObsidianCCSettings = {
  // Backend - default to SDK for agentic features
  agenticBackend: 'sdk',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,

  // Claude Code Integration - enabled by default
  claudeCodeIntegration: true,
  autoUpdateClaudeMd: true,
  mcpServerEnabled: true,
  mcpServerPort: 3333,

  // @ Triggers - both enabled by default
  inlineEnabled: true,
  agenticEnabled: true,
  inlineTrigger: '@claude',
  agenticTrigger: '@cc',

  // QMD - enabled but auto-detect path
  qmdEnabled: true,
  qmdPath: '',
  autoIndex: true,
  searchMode: 'hybrid',
  maxSearchResults: 10,

  // Tasks - enabled with obsidian-tasks format
  tasksIntegration: true,
  taskFormat: 'obsidian-tasks',

  // GitHub
  defaultClonePath: '',

  // Security - conservative defaults
  requireApproval: true,
  auditLogging: false,

  // Advanced
  debugMode: false,
  customSystemPrompt: '',
  timeout: 60000,
};

/**
 * Model options available for selection
 */
export const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Most capable)' },
  { value: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5 (Fastest)' },
] as const;

/**
 * Task format options
 */
export const TASK_FORMAT_OPTIONS = [
  { value: 'obsidian-tasks', label: 'Obsidian Tasks Plugin' },
  { value: 'dataview', label: 'Dataview Compatible' },
  { value: 'basic', label: 'Basic Markdown' },
] as const;

/**
 * Search mode options for QMD
 */
export const SEARCH_MODE_OPTIONS = [
  { value: 'hybrid', label: 'Hybrid (Best quality)' },
  { value: 'semantic', label: 'Semantic Only' },
  { value: 'keyword', label: 'Keyword Only (Fastest)' },
] as const;
