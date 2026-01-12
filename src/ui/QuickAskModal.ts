import { App, Modal, Notice, MarkdownRenderer, Component } from 'obsidian';
import { ClaudeAPI } from '../core/api/ClaudeAPI';

/**
 * Quick Ask Modal
 *
 * Fast way to ask Claude anything without leaving your note.
 */
export class QuickAskModal extends Modal {
  private claudeApi: ClaudeAPI;
  private questionInput: HTMLTextAreaElement | null = null;
  private responseContainer: HTMLElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private isLoading = false;
  private currentContext: string;

  constructor(app: App, claudeApi: ClaudeAPI, context: string = '') {
    super(app);
    this.claudeApi = claudeApi;
    this.currentContext = context;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('cc-quick-ask-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'cc-quick-ask-header' });
    header.createEl('h2', { text: '💬 Ask Claude' });

    // Context indicator
    if (this.currentContext) {
      const contextBar = contentEl.createDiv({ cls: 'cc-quick-ask-context' });
      contextBar.createEl('span', { text: '📄 Using current note as context' });
    }

    // Question input
    const inputContainer = contentEl.createDiv({ cls: 'cc-quick-ask-input-container' });
    this.questionInput = inputContainer.createEl('textarea', {
      placeholder: 'Ask anything...',
      cls: 'cc-quick-ask-input',
    });
    this.questionInput.rows = 3;

    // Handle Cmd+Enter to submit
    this.questionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.submitQuestion();
      }
    });

    // Button row
    const buttonRow = contentEl.createDiv({ cls: 'cc-quick-ask-buttons' });

    // Hint
    buttonRow.createEl('span', {
      text: '⌘+Enter to submit',
      cls: 'cc-quick-ask-hint',
    });

    this.submitBtn = buttonRow.createEl('button', {
      text: 'Ask',
      cls: 'cc-quick-ask-submit mod-cta',
    });
    this.submitBtn.addEventListener('click', () => this.submitQuestion());

    // Response container
    this.responseContainer = contentEl.createDiv({ cls: 'cc-quick-ask-response' });

    // Focus input
    setTimeout(() => this.questionInput?.focus(), 50);
  }

  private async submitQuestion(): Promise<void> {
    if (!this.questionInput || !this.responseContainer || !this.submitBtn) return;

    const question = this.questionInput.value.trim();
    if (!question) {
      new Notice('Please enter a question');
      return;
    }

    if (this.isLoading) return;

    this.isLoading = true;
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = 'Thinking...';
    this.responseContainer.empty();
    this.responseContainer.addClass('cc-quick-ask-loading');
    this.responseContainer.textContent = '⏳ Claude is thinking...';

    try {
      // Build prompt with context
      let prompt = question;
      if (this.currentContext) {
        prompt = `Context from current note:\n\n${this.currentContext}\n\n---\n\nQuestion: ${question}`;
      }

      const response = await this.claudeApi.complete(prompt, undefined, {
        maxTokens: 2048,
        temperature: 0.7,
      });

      // Render markdown response
      this.responseContainer.empty();
      this.responseContainer.removeClass('cc-quick-ask-loading');
      this.responseContainer.addClass('cc-quick-ask-has-response');

      await MarkdownRenderer.render(
        this.app,
        response,
        this.responseContainer,
        '',
        this as unknown as Component
      );

      // Add copy button
      const copyBtn = this.responseContainer.createEl('button', {
        text: '📋 Copy',
        cls: 'cc-quick-ask-copy',
      });
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(response);
        new Notice('Copied to clipboard');
      });

      // Add insert button
      const insertBtn = this.responseContainer.createEl('button', {
        text: '📝 Insert',
        cls: 'cc-quick-ask-insert',
      });
      insertBtn.addEventListener('click', () => {
        this.insertAtCursor(response);
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.responseContainer.empty();
      this.responseContainer.removeClass('cc-quick-ask-loading');
      this.responseContainer.addClass('cc-quick-ask-error');
      this.responseContainer.textContent = `❌ Error: ${msg}`;
      new Notice(`Failed: ${msg}`);
    } finally {
      this.isLoading = false;
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = 'Ask';
      }
    }
  }

  private insertAtCursor(text: string): void {
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      const cursor = editor.getCursor();
      editor.replaceRange('\n\n' + text + '\n', cursor);
      this.close();
      new Notice('Inserted into note');
    } else {
      new Notice('No active editor');
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
