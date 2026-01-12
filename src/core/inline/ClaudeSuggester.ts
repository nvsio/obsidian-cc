import {
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
  Notice,
} from 'obsidian';
import type ObsidianCCPlugin from '../../main';
import { QMDSearchModal } from '../../ui/QMDSearchModal';
import { getThinkingChar } from '../../settings/SettingsSchema';
import { spawn } from 'child_process';
import * as os from 'os';

interface ClaudeSuggestion {
  type: 'command' | 'custom' | 'cc' | 'cc-install' | 'search' | 'qmd-install';
  command?: string;
  label: string;
  description: string;
  prompt?: string;
}

// Quick commands - shortcuts for common actions
const QUICK_COMMANDS: ClaudeSuggestion[] = [
  { type: 'command', command: 'summarize', label: '/summarize', description: 'Summarize the text above' },
  { type: 'command', command: 'expand', label: '/expand', description: 'Add more detail and depth' },
  { type: 'command', command: 'rewrite', label: '/rewrite', description: 'Improve clarity and flow' },
  { type: 'command', command: 'fix', label: '/fix', description: 'Fix grammar and spelling' },
  { type: 'command', command: 'bullets', label: '/bullets', description: 'Convert to bullet points' },
  { type: 'command', command: 'explain', label: '/explain', description: 'Explain in simpler terms' },
  { type: 'command', command: 'continue', label: '/continue', description: 'Continue writing' },
  { type: 'search', label: '/search', description: 'Semantic search vault (QMD)' },
];

// Command to prompt mapping
const COMMAND_PROMPTS: Record<string, string> = {
  summarize: 'Summarize the above text concisely, capturing the key points.',
  expand: 'Expand on the above text with more detail, examples, and depth.',
  rewrite: 'Rewrite the above text to improve clarity, flow, and readability.',
  fix: 'Fix any grammar, spelling, and punctuation errors in the above text.',
  bullets: 'Convert the above text into clear, well-organized bullet points.',
  explain: 'Explain the above text in simpler terms that anyone can understand.',
  continue: 'Continue writing from where the above text left off, maintaining the same style and tone.',
};

// @cc options
const CC_OPEN: ClaudeSuggestion = {
  type: 'cc',
  label: '💻 Open in Claude CLI',
  description: 'Launch terminal with full note',
};

const CC_INSTALL: ClaudeSuggestion = {
  type: 'cc-install',
  label: '📦 Install Claude CLI',
  description: 'Install and launch Claude CLI',
};

// @qmd options
const QMD_SEARCH: ClaudeSuggestion = {
  type: 'search',
  label: '🔍 Semantic Search',
  description: 'Search vault with QMD',
};

const QMD_INSTALL: ClaudeSuggestion = {
  type: 'qmd-install',
  label: '📦 Install QMD',
  description: 'Install QMD for semantic search',
};

/**
 * Claude Code-style inline completions
 * - Type @claude to see quick commands
 * - Type @claude <prompt> for custom requests
 * - Type @cc to open in Claude CLI
 * - Type @qmd for semantic search
 */
export class ClaudeSuggester extends EditorSuggest<ClaudeSuggestion> {
  plugin: ObsidianCCPlugin;
  private isExecuting = false;
  private currentTrigger: 'claude' | 'cc' | 'qmd' = 'claude';
  private cliInstalled: boolean | null = null;
  private qmdInstalled: boolean | null = null;

  constructor(plugin: ObsidianCCPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.checkCLIInstalled();
    this.checkQMDInstalled();
  }

  private async checkCLIInstalled(): Promise<void> {
    this.cliInstalled = await this.plugin.claudeCLIService.isInstalled();
  }

  private async checkQMDInstalled(): Promise<void> {
    this.qmdInstalled = await this.plugin.qmdClient.isAvailable();
  }

  /**
   * Open terminal with a command
   */
  private openTerminalWithCommand(cmd: string): void {
    const platform = os.platform();

    if (platform === 'darwin') {
      const script = `
        tell application "Terminal"
          activate
          do script "${cmd}"
        end tell
      `;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      new Notice('Opening Terminal...');
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', 'cmd', '/k', cmd], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      new Notice('Opening terminal...');
    } else {
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
      for (const term of terminals) {
        try {
          if (term === 'gnome-terminal') {
            spawn(term, ['--', 'bash', '-c', `${cmd}; exec bash`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          } else {
            spawn(term, ['-e', `bash -c "${cmd}; exec bash"`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
          new Notice('Opening terminal...');
          return;
        } catch {
          continue;
        }
      }
      new Notice('Could not open terminal');
    }
  }

  /**
   * Handle @cc selection - launch or install CLI
   */
  private async handleCCSelection(
    suggestion: ClaudeSuggestion,
    editor: Editor,
    cursor: EditorPosition,
    line: string
  ): Promise<void> {
    const trigger = this.plugin.settings.agenticTrigger;
    const triggerIndex = line.lastIndexOf(trigger);

    // Remove the @cc trigger from the line
    if (triggerIndex !== -1) {
      editor.replaceRange(
        '',
        { line: cursor.line, ch: triggerIndex },
        { line: cursor.line, ch: line.length }
      );
    }

    // Get the full note content
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file');
      return;
    }

    const noteContent = await this.plugin.app.vault.read(file);
    const notePath = file.path;

    // Install opens terminal - don't auto-launch after
    if (suggestion.type === 'cc-install') {
      await this.plugin.claudeCLIService.install();
      new Notice('After install completes, type @cc again to launch');
      return;
    }

    // Launch CLI with note content
    await this.plugin.claudeCLIService.launch(noteContent, notePath);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    if (this.isExecuting) return null;

    const line = editor.getLine(cursor.line);
    const beforeCursor = line.slice(0, cursor.ch);

    // Check for @qmd trigger
    const qmdTrigger = '@qmd';
    const qmdIndex = beforeCursor.lastIndexOf(qmdTrigger);

    // Check for @cc trigger
    const ccTrigger = this.plugin.settings.agenticTrigger;
    const ccIndex = beforeCursor.lastIndexOf(ccTrigger);

    // Check for @claude trigger
    const claudeTrigger = this.plugin.settings.inlineTrigger;
    const claudeIndex = beforeCursor.lastIndexOf(claudeTrigger);

    // Use whichever trigger appears later (most recent)
    const maxIndex = Math.max(qmdIndex, ccIndex, claudeIndex);

    if (maxIndex === qmdIndex && qmdIndex !== -1 && this.plugin.settings.qmdEnabled) {
      this.currentTrigger = 'qmd';
      return {
        start: { line: cursor.line, ch: qmdIndex },
        end: cursor,
        query: beforeCursor.slice(qmdIndex + qmdTrigger.length).trim(),
      };
    } else if (maxIndex === ccIndex && ccIndex !== -1 && this.plugin.settings.agenticEnabled) {
      this.currentTrigger = 'cc';
      return {
        start: { line: cursor.line, ch: ccIndex },
        end: cursor,
        query: beforeCursor.slice(ccIndex + ccTrigger.length).trim(),
      };
    } else if (claudeIndex !== -1 && this.plugin.settings.inlineEnabled) {
      this.currentTrigger = 'claude';
      return {
        start: { line: cursor.line, ch: claudeIndex },
        end: cursor,
        query: beforeCursor.slice(claudeIndex + claudeTrigger.length).trim(),
      };
    }

    return null;
  }

  getSuggestions(context: EditorSuggestContext): ClaudeSuggestion[] {
    // If @qmd trigger, always show search - modal handles if QMD not found
    if (this.currentTrigger === 'qmd') {
      return [QMD_SEARCH];
    }

    // If @cc trigger, show the CLI option based on install status
    if (this.currentTrigger === 'cc') {
      // Refresh check in background
      this.checkCLIInstalled();
      return this.cliInstalled === false ? [CC_INSTALL] : [CC_OPEN];
    }

    const query = context.query.toLowerCase();

    // No query yet - show all quick commands
    if (!query) {
      return QUICK_COMMANDS;
    }

    // Check if query matches a command
    const matchingCommands = QUICK_COMMANDS.filter(
      (cmd) => cmd.command?.startsWith(query) || cmd.label.toLowerCase().includes(query)
    );

    // If query looks like a command (starts with /), only show matching commands
    if (query.startsWith('/')) {
      return matchingCommands.length > 0 ? matchingCommands : [];
    }

    // Otherwise, show matching commands + custom run option
    const suggestions: ClaudeSuggestion[] = [...matchingCommands];

    // Add custom prompt option if query is long enough
    if (query.length >= 3) {
      suggestions.unshift({
        type: 'custom',
        label: `⏎ "${query.slice(0, 35)}${query.length > 35 ? '...' : ''}"`,
        description: 'Run custom prompt',
        prompt: context.query, // Use original case
      });
    }

    return suggestions;
  }

  renderSuggestion(suggestion: ClaudeSuggestion, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'cc-suggestion' });

    if (suggestion.type === 'custom') {
      container.addClass('cc-suggestion-custom');
    } else {
      container.addClass('cc-suggestion-command');
    }

    const labelEl = container.createDiv({ cls: 'cc-suggestion-label' });
    labelEl.setText(suggestion.label);

    const descEl = container.createDiv({ cls: 'cc-suggestion-description' });
    descEl.setText(suggestion.description);
  }

  async selectSuggestion(
    suggestion: ClaudeSuggestion,
    _evt: MouseEvent | KeyboardEvent
  ): Promise<void> {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Handle @cc triggers (CLI launch/install)
    if (suggestion.type === 'cc' || suggestion.type === 'cc-install') {
      await this.handleCCSelection(suggestion, editor, cursor, line);
      return;
    }

    // Handle @qmd install - open terminal with install command
    if (suggestion.type === 'qmd-install') {
      const qmdIndex = line.lastIndexOf('@qmd');
      if (qmdIndex !== -1) {
        editor.replaceRange('', { line: cursor.line, ch: qmdIndex }, { line: cursor.line, ch: line.length });
      }
      this.openTerminalWithCommand('bun install -g https://github.com/tobi/qmd');
      new Notice('After install completes, type @qmd again to search');
      return;
    }

    // Handle search command - open QMD modal
    if (suggestion.type === 'search') {
      // Check for @qmd trigger first, then @claude
      const qmdIndex = line.lastIndexOf('@qmd');
      const claudeIndex = line.lastIndexOf(this.plugin.settings.inlineTrigger);
      const triggerIndex = qmdIndex > claudeIndex ? qmdIndex : claudeIndex;

      // Remove the trigger text
      if (triggerIndex !== -1) {
        editor.replaceRange('', { line: cursor.line, ch: triggerIndex }, { line: cursor.line, ch: line.length });
      }
      new QMDSearchModal(this.plugin.app, this.plugin.qmdClient).open();
      return;
    }

    const trigger = this.plugin.settings.inlineTrigger;
    const triggerIndex = line.lastIndexOf(trigger);

    // Determine the prompt to send
    let userPrompt: string;
    if (suggestion.type === 'command' && suggestion.command) {
      userPrompt = COMMAND_PROMPTS[suggestion.command] || suggestion.description;
    } else if (suggestion.prompt) {
      userPrompt = suggestion.prompt;
    } else {
      new Notice('Please type a prompt after @claude');
      return;
    }

    // Get context (text above)
    let context = '';
    if (cursor.line > 0) {
      const lines: string[] = [];
      for (let i = Math.max(0, cursor.line - 30); i < cursor.line; i++) {
        lines.push(editor.getLine(i));
      }
      context = lines.join('\n');
    }
    // Also add text before trigger on same line
    if (triggerIndex > 0) {
      context += '\n' + line.slice(0, triggerIndex).trim();
    }

    if (!context.trim()) {
      new Notice('No text above to work with');
      return;
    }

    // Execute
    this.isExecuting = true;

    try {
      // Replace trigger line with loading indicator
      const thinkingChar = getThinkingChar(this.plugin.settings.thinkingAnimation);
      const lineStart = { line: cursor.line, ch: triggerIndex };
      const lineEnd = { line: cursor.line, ch: line.length };
      editor.replaceRange(thinkingChar, lineStart, lineEnd);

      // Build the full prompt
      const fullPrompt = `Here is the text:\n\n${context}\n\n---\n\n${userPrompt}\n\nRespond with only the result, no explanations or preamble.`;

      // Call Claude API
      const result = await this.plugin.claudeApi.complete(fullPrompt, undefined, {
        maxTokens: 2048,
        temperature: 0.7,
      });

      // Replace loading with result
      const currentLine = editor.getLine(cursor.line);
      const loadingIndex = currentLine.indexOf(thinkingChar);
      if (loadingIndex !== -1) {
        editor.replaceRange(
          result.trim(),
          { line: cursor.line, ch: loadingIndex },
          { line: cursor.line, ch: loadingIndex + thinkingChar.length }
        );
      } else {
        // Fallback: append result
        editor.replaceRange('\n\n' + result.trim(), { line: cursor.line, ch: editor.getLine(cursor.line).length });
      }

    } catch (error) {
      const thinkingChar = getThinkingChar(this.plugin.settings.thinkingAnimation);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`Error: ${errorMsg}`);

      // Replace loading with error indicator
      const currentLine = editor.getLine(cursor.line);
      const loadingIndex = currentLine.indexOf(thinkingChar);
      if (loadingIndex !== -1) {
        editor.replaceRange(
          `❌ ${errorMsg}`,
          { line: cursor.line, ch: loadingIndex },
          { line: cursor.line, ch: loadingIndex + thinkingChar.length }
        );
      }
    } finally {
      this.isExecuting = false;
    }
  }
}
