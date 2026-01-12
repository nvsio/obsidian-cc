import { Notice, Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { ObsidianCCSettings, DEFAULT_SETTINGS } from './settings/SettingsSchema';
import { KeychainService } from './core/security/KeychainService';
import { InputSanitizer } from './core/security/InputSanitizer';
import { ClaudeAPI } from './core/api/ClaudeAPI';
import { SettingsTab } from './settings/SettingsTab';
import { InlineRenderer } from './core/inline/InlineRenderer';
import { TriggerParser, ParsedTrigger } from './core/inline/TriggerParser';
import { MCPServer } from './mcp/MCPServer';
import { ClaudeSuggester } from './core/inline/ClaudeSuggester';
import { QMDSearchModal } from './ui/QMDSearchModal';
import { QuickAskModal } from './ui/QuickAskModal';
import { QMDClient } from './mcp/integrations/QMDClient';
import { ClaudeCLIService } from './core/cli/ClaudeCLIService';

// View type constants
export const VIEW_TYPE_CHAT = 'obsidian-cc-chat';

/**
 * Obsidian CC - The Ultimate Obsidian Companion
 *
 * Features:
 * - @claude: Quick inline completions (Notion-style)
 * - @cc: Full agentic sessions with tool use
 * - QMD semantic search integration
 * - Obsidian Tasks integration
 * - GitHub clone + AI setup workflow
 */
export default class ObsidianCCPlugin extends Plugin {
  settings!: ObsidianCCSettings;
  keychainService!: KeychainService;
  sanitizer!: InputSanitizer;
  claudeApi!: ClaudeAPI;
  inlineRenderer!: InlineRenderer;
  triggerParser!: TriggerParser;
  mcpServer!: MCPServer;
  qmdClient!: QMDClient;
  claudeCLIService!: ClaudeCLIService;

  async onload(): Promise<void> {
    console.log('Loading Obsidian CC plugin');

    // Load settings
    await this.loadSettings();

    // Initialize core services
    this.keychainService = new KeychainService(this);
    this.sanitizer = new InputSanitizer();
    this.claudeApi = new ClaudeAPI(this.keychainService, {
      model: this.settings.model,
      maxTokens: this.settings.maxTokens,
      temperature: this.settings.temperature,
    });
    this.inlineRenderer = new InlineRenderer(this.claudeApi);
    this.triggerParser = new TriggerParser(
      this.settings.inlineTrigger,
      this.settings.agenticTrigger
    );

    // Register settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register ribbon icon
    if (this.settings.agenticEnabled) {
      this.addRibbonIcon('message-circle', 'Open Claude Chat', () => {
        this.activateChatView();
      });
    }

    // Register commands
    this.registerCommands();

    // Register suggester for @claude autocomplete
    if (this.settings.inlineEnabled) {
      this.registerEditorSuggest(new ClaudeSuggester(this));
    }

    // Initialize MCP server
    this.mcpServer = new MCPServer(this.app, this.settings);

    // Initialize QMD client
    const vaultPath = (this.app.vault.adapter as any).basePath || '';
    this.qmdClient = new QMDClient(vaultPath, this.settings);
    this.qmdClient.initialize();

    // Initialize Claude CLI service
    this.claudeCLIService = new ClaudeCLIService(this.app);

    // Start MCP server if enabled
    if (this.settings.mcpServerEnabled) {
      this.startMCPServer();
    }

    console.log('Obsidian CC plugin loaded successfully');
  }

  /**
   * Start the MCP server
   */
  private async startMCPServer(): Promise<void> {
    try {
      await this.mcpServer.start();
      if (this.settings.debugMode) {
        new Notice(`MCP server started on port ${this.mcpServer.getPort()}`);
      }
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      new Notice(`Failed to start MCP server: ${error}`);
    }
  }

  /**
   * Stop the MCP server
   */
  private async stopMCPServer(): Promise<void> {
    try {
      await this.mcpServer.stop();
      if (this.settings.debugMode) {
        new Notice('MCP server stopped');
      }
    } catch (error) {
      console.error('Failed to stop MCP server:', error);
    }
  }

  /**
   * Handle @claude inline trigger (public for suggester)
   */
  async handleClaudeTriggerPublic(
    trigger: ParsedTrigger,
    context: string
  ): Promise<string> {
    return this.handleClaudeTrigger(trigger, context);
  }

  /**
   * Handle @claude inline trigger
   */
  private async handleClaudeTrigger(
    trigger: ParsedTrigger,
    context: string
  ): Promise<string> {
    // Check for API key
    const hasKey = await this.hasApiKey();
    if (!hasKey) {
      new Notice('Please configure your Anthropic API key in settings');
      throw new Error('API key not configured');
    }

    // Log if debug mode
    if (this.settings.debugMode) {
      console.log('Obsidian CC: @claude trigger', { trigger, contextLength: context.length });
    }

    // Execute via inline renderer
    try {
      const result = await this.inlineRenderer.execute(trigger, context);

      if (this.settings.auditLogging) {
        console.log('Obsidian CC: Inline execution completed', {
          command: trigger.command,
          inputTokens: this.claudeApi.estimateTokens(context),
          outputTokens: this.claudeApi.estimateTokens(result),
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`@claude failed: ${message}`);
      throw error;
    }
  }

  /**
   * Handle @cc agentic trigger - launches Claude CLI with note content
   */
  private async handleCCTrigger(trigger: ParsedTrigger, context: string): Promise<void> {
    // Log if debug mode
    if (this.settings.debugMode) {
      console.log('Obsidian CC: @cc trigger', { trigger, contextLength: context.length });
    }

    // Get current file for context
    const activeFile = this.app.workspace.getActiveFile();
    const notePath = activeFile?.path || 'untitled';

    // Build full note content (context + trigger args if any)
    let noteContent = context;
    if (trigger.args) {
      noteContent += '\n\n---\nUser request: ' + trigger.args;
    }

    // Launch Claude CLI with the note content
    await this.claudeCLIService.launch(noteContent, notePath);
  }

  async onunload(): Promise<void> {
    console.log('Unloading Obsidian CC plugin');

    // Stop MCP server
    if (this.mcpServer?.isServerRunning()) {
      await this.stopMCPServer();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Register all plugin commands
   */
  private registerCommands(): void {
    // Execute @claude or @cc trigger on current line (Cmd+Shift+E or command palette)
    this.addCommand({
      id: 'execute-trigger',
      name: 'Execute @claude/@cc Trigger',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'e' }],
      editorCallback: (editor) => {
        console.log('CC: Command triggered!');
        this.executeTriggerOnLine(editor);
      },
    });
    console.log('CC: execute-trigger command registered');

    // Quick ask command
    this.addCommand({
      id: 'quick-ask',
      name: 'Quick Ask Claude',
      hotkeys: [{ modifiers: ['Mod'], key: 'j' }],
      editorCallback: (editor) => {
        // Get current context from editor
        const selection = editor.getSelection();
        const context = selection || '';
        new QuickAskModal(this.app, this.claudeApi, context).open();
      },
    });

    // Start chat session
    this.addCommand({
      id: 'start-session',
      name: 'Start Chat Session',
      callback: () => {
        this.activateChatView();
      },
    });

    // Search vault with QMD
    this.addCommand({
      id: 'search-vault',
      name: 'Semantic Search (QMD)',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'f' }],
      callback: () => {
        new QMDSearchModal(this.app, this.qmdClient).open();
      },
    });

    // New project from GitHub
    this.addCommand({
      id: 'new-project-github',
      name: 'New Project from GitHub',
      callback: () => {
        // TODO: Implement GitHub clone modal
        console.log('New Project from GitHub command triggered');
      },
    });

    // Analyze project
    this.addCommand({
      id: 'analyze-project',
      name: 'Analyze Project',
      callback: () => {
        // TODO: Implement project analysis
        console.log('Analyze Project command triggered');
      },
    });
  }

  /**
   * Activate or create the chat sidebar view
   */
  async activateChatView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

    if (leaves.length > 0) {
      // View already exists, reveal it
      leaf = leaves[0];
    } else {
      // Create new view in right sidebar
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Check if API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    const key = await this.keychainService.getApiKey();
    return key !== null && key.length > 0;
  }

  /**
   * Get debug mode status
   */
  isDebugMode(): boolean {
    return this.settings.debugMode;
  }

  /**
   * Execute trigger on the current editor line
   */
  async executeTriggerOnLine(editor: import('obsidian').Editor): Promise<void> {
    console.log('CC: executeTriggerOnLine called');
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    console.log('CC: line:', line);
    const trigger = this.triggerParser.parseLine(line);
    console.log('CC: trigger:', trigger);

    if (!trigger) {
      new Notice('No @claude or @cc trigger found on current line');
      return;
    }

    const validation = this.triggerParser.validateTrigger(trigger);
    if (!validation.valid) {
      new Notice(validation.error || 'Invalid trigger');
      return;
    }

    // Get context (text before trigger line)
    let context = '';
    if (cursor.line > 0) {
      const lines: string[] = [];
      for (let i = Math.max(0, cursor.line - 20); i < cursor.line; i++) {
        lines.push(editor.getLine(i));
      }
      context = lines.join('\n');
    }

    if (trigger.type === 'claude') {
      try {
        new Notice('Executing @claude...');
        const result = await this.handleClaudeTrigger(trigger, context);
        // Replace trigger with result
        const from = { line: cursor.line, ch: trigger.startIndex };
        const to = { line: cursor.line, ch: trigger.endIndex };
        editor.replaceRange(result, from, to);
      } catch (error) {
        // Error already shown in handleClaudeTrigger
      }
    } else if (trigger.type === 'cc') {
      this.handleCCTrigger(trigger, context);
    }
  }
}
