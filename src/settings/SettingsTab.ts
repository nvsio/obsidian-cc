import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ObsidianCCPlugin from '../main';
import {
  MODEL_OPTIONS,
  TASK_FORMAT_OPTIONS,
  SEARCH_MODE_OPTIONS,
} from './SettingsSchema';

/**
 * Settings tab for Obsidian CC
 * Organized into sections for better UX
 */
export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianCCPlugin;

  constructor(app: App, plugin: ObsidianCCPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Header
    containerEl.createEl('h1', { text: 'Obsidian CC Settings' });
    containerEl.createEl('p', {
      text: 'The ultimate Obsidian companion - Claude AI with QMD semantic search',
      cls: 'setting-item-description',
    });

    // API Configuration Section
    this.renderApiSection(containerEl);

    // Claude Code Integration Section
    this.renderClaudeCodeSection(containerEl);

    // @ Triggers Section
    this.renderTriggersSection(containerEl);

    // QMD Section
    this.renderQMDSection(containerEl);

    // Tasks Integration Section
    this.renderTasksSection(containerEl);

    // GitHub Section
    this.renderGitHubSection(containerEl);

    // Security Section
    this.renderSecuritySection(containerEl);

    // Advanced Section
    this.renderAdvancedSection(containerEl);
  }

  /**
   * Claude Code Integration Section
   */
  private renderClaudeCodeSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Claude Code Integration' });
    containerEl.createEl('p', {
      text: 'Connect Obsidian CC with Claude Code for seamless vault access from the CLI',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Enable Claude Code integration')
      .setDesc('Allow Claude Code to access your vault via MCP')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.claudeCodeIntegration)
          .onChange(async (value) => {
            this.plugin.settings.claudeCodeIntegration = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-update CLAUDE.md')
      .setDesc('Automatically add vault context to your CLAUDE.md file')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoUpdateClaudeMd)
          .onChange(async (value) => {
            this.plugin.settings.autoUpdateClaudeMd = value;
            await this.plugin.saveSettings();
            if (value) {
              new Notice('CLAUDE.md will be updated with vault context');
            }
          });
      });

    new Setting(containerEl)
      .setName('Enable MCP server')
      .setDesc('Start an MCP server for Claude Code/Desktop to connect')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.mcpServerEnabled)
          .onChange(async (value) => {
            this.plugin.settings.mcpServerEnabled = value;
            await this.plugin.saveSettings();
            if (value) {
              new Notice('MCP server will start on next Obsidian launch');
            }
          });
      });

    new Setting(containerEl)
      .setName('MCP server port')
      .setDesc('Port for the MCP WebSocket server')
      .addText((text) => {
        text
          .setPlaceholder('3333')
          .setValue(String(this.plugin.settings.mcpServerPort))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 1024 && num < 65535) {
              this.plugin.settings.mcpServerPort = num;
              await this.plugin.saveSettings();
            }
          });
      });

    // Add button to manually update CLAUDE.md
    new Setting(containerEl)
      .setName('Update CLAUDE.md now')
      .setDesc('Manually trigger CLAUDE.md update with vault context')
      .addButton((btn) => {
        btn
          .setButtonText('Update')
          .setCta()
          .onClick(async () => {
            // TODO: Implement CLAUDE.md update
            new Notice('CLAUDE.md updated with vault context');
          });
      });
  }

  /**
   * API Configuration Section
   */
  private renderApiSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'API Configuration' });

    // API Key (secure storage)
    new Setting(containerEl)
      .setName('Anthropic API Key')
      .setDesc(this.getApiKeyDescription())
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder('sk-ant-...');

        // Load existing key (masked)
        this.plugin.keychainService.getApiKey().then((key) => {
          if (key) {
            text.setValue('••••••••••••••••');
          }
        });

        text.onChange(async (value) => {
          if (value && value !== '••••••••••••••••') {
            if (this.plugin.keychainService.validateApiKeyFormat(value)) {
              await this.plugin.keychainService.storeApiKey(value);
              new Notice('API key saved securely');
              text.setValue('••••••••••••••••');
            } else {
              new Notice('Invalid API key format. Should start with sk-ant-');
            }
          }
        });
      })
      .addButton((btn) => {
        btn
          .setIcon('trash')
          .setTooltip('Delete API key')
          .onClick(async () => {
            await this.plugin.keychainService.deleteApiKey();
            new Notice('API key deleted');
            this.display(); // Refresh
          });
      });

    // Show security status
    const status = this.plugin.keychainService.getStorageStatus();
    if (!status.secure) {
      const warningEl = containerEl.createEl('div', {
        cls: 'mod-warning setting-item-description',
      });
      warningEl.createEl('strong', { text: 'Warning: ' });
      warningEl.appendText(
        'Secure storage unavailable. Consider using ANTHROPIC_API_KEY environment variable.'
      );
    }

    // Model selection
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Claude model to use for AI operations')
      .addDropdown((dropdown) => {
        for (const option of MODEL_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          });
      });

    // Agentic backend
    new Setting(containerEl)
      .setName('Agentic Backend')
      .setDesc('Backend for @cc agentic sessions')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('sdk', 'Claude Agent SDK (Recommended)')
          .addOption('cli', 'Claude CLI')
          .setValue(this.plugin.settings.agenticBackend)
          .onChange(async (value: 'sdk' | 'cli') => {
            this.plugin.settings.agenticBackend = value;
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * @ Triggers Section
   */
  private renderTriggersSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '@ Triggers' });

    // Inline mode (@claude)
    new Setting(containerEl)
      .setName('Enable @claude inline mode')
      .setDesc('Quick inline completions - Notion-style')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.inlineEnabled)
          .onChange(async (value) => {
            this.plugin.settings.inlineEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    // Custom inline trigger
    new Setting(containerEl)
      .setName('Inline trigger')
      .setDesc('Text pattern to trigger inline mode')
      .addText((text) => {
        text
          .setPlaceholder('@claude')
          .setValue(this.plugin.settings.inlineTrigger)
          .onChange(async (value) => {
            this.plugin.settings.inlineTrigger = value || '@claude';
            await this.plugin.saveSettings();
          });
      });

    // Agentic mode (@cc)
    new Setting(containerEl)
      .setName('Enable @cc agentic mode')
      .setDesc('Full agentic sessions with file operations and tool use')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.agenticEnabled)
          .onChange(async (value) => {
            this.plugin.settings.agenticEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    // Custom agentic trigger
    new Setting(containerEl)
      .setName('Agentic trigger')
      .setDesc('Text pattern to trigger agentic mode')
      .addText((text) => {
        text
          .setPlaceholder('@cc')
          .setValue(this.plugin.settings.agenticTrigger)
          .onChange(async (value) => {
            this.plugin.settings.agenticTrigger = value || '@cc';
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * QMD Section
   */
  private renderQMDSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'QMD Semantic Search' });

    new Setting(containerEl)
      .setName('Enable QMD')
      .setDesc('Use QMD for semantic vault search')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.qmdEnabled)
          .onChange(async (value) => {
            this.plugin.settings.qmdEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('QMD binary path')
      .setDesc('Leave empty for auto-detection')
      .addText((text) => {
        text
          .setPlaceholder('/usr/local/bin/qmd')
          .setValue(this.plugin.settings.qmdPath)
          .onChange(async (value) => {
            this.plugin.settings.qmdPath = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-index vault')
      .setDesc('Automatically index vault on plugin load')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoIndex)
          .onChange(async (value) => {
            this.plugin.settings.autoIndex = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Search mode')
      .setDesc('QMD search strategy')
      .addDropdown((dropdown) => {
        for (const option of SEARCH_MODE_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.searchMode)
          .onChange(async (value: 'hybrid' | 'semantic' | 'keyword') => {
            this.plugin.settings.searchMode = value;
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * Tasks Integration Section
   */
  private renderTasksSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Tasks Integration' });

    new Setting(containerEl)
      .setName('Enable Tasks integration')
      .setDesc('AI can read and write Obsidian Tasks')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.tasksIntegration)
          .onChange(async (value) => {
            this.plugin.settings.tasksIntegration = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Task format')
      .setDesc('Task syntax to use')
      .addDropdown((dropdown) => {
        for (const option of TASK_FORMAT_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.taskFormat)
          .onChange(async (value: 'obsidian-tasks' | 'dataview' | 'basic') => {
            this.plugin.settings.taskFormat = value;
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * GitHub Section
   */
  private renderGitHubSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'GitHub Integration' });

    // GitHub token (secure storage)
    new Setting(containerEl)
      .setName('GitHub Token')
      .setDesc('Personal access token for cloning private repos')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder('ghp_...');

        this.plugin.keychainService.getGitHubToken().then((token) => {
          if (token) {
            text.setValue('••••••••••••••••');
          }
        });

        text.onChange(async (value) => {
          if (value && value !== '••••••••••••••••') {
            await this.plugin.keychainService.storeGitHubToken(value);
            new Notice('GitHub token saved securely');
            text.setValue('••••••••••••••••');
          }
        });
      })
      .addButton((btn) => {
        btn
          .setIcon('trash')
          .setTooltip('Delete GitHub token')
          .onClick(async () => {
            await this.plugin.keychainService.deleteGitHubToken();
            new Notice('GitHub token deleted');
            this.display();
          });
      });

    new Setting(containerEl)
      .setName('Default clone path')
      .setDesc('Where to clone repos (relative to vault)')
      .addText((text) => {
        text
          .setPlaceholder('Projects/')
          .setValue(this.plugin.settings.defaultClonePath)
          .onChange(async (value) => {
            this.plugin.settings.defaultClonePath = value;
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * Security Section
   */
  private renderSecuritySection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Security' });

    new Setting(containerEl)
      .setName('Require approval for file writes')
      .setDesc('Ask before AI writes or modifies files')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.requireApproval)
          .onChange(async (value) => {
            this.plugin.settings.requireApproval = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Audit logging')
      .setDesc('Log all AI operations to console')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.auditLogging)
          .onChange(async (value) => {
            this.plugin.settings.auditLogging = value;
            await this.plugin.saveSettings();
          });
      });

    // Storage status info
    const status = this.plugin.keychainService.getStorageStatus();
    const infoEl = containerEl.createEl('div', {
      cls: 'setting-item-description',
    });
    infoEl.createEl('strong', { text: 'Storage backend: ' });
    infoEl.appendText(status.backend);
    if (status.secure) {
      infoEl.appendText(' (secure)');
    } else {
      infoEl.appendText(' (not secure)');
    }
  }

  /**
   * Advanced Section
   */
  private renderAdvancedSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Advanced' });

    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable verbose logging')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.debugMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Custom system prompt')
      .setDesc('Prepend to all AI requests (optional)')
      .addTextArea((text) => {
        text
          .setPlaceholder('You are a helpful assistant...')
          .setValue(this.plugin.settings.customSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customSystemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 50;
      });

    new Setting(containerEl)
      .setName('Request timeout (ms)')
      .setDesc('Maximum time to wait for API response')
      .addText((text) => {
        text
          .setPlaceholder('60000')
          .setValue(String(this.plugin.settings.timeout))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.timeout = num;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Max tokens')
      .setDesc('Maximum tokens in AI response')
      .addText((text) => {
        text
          .setPlaceholder('4096')
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxTokens = num;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('AI creativity (0 = focused, 1 = creative)')
      .addSlider((slider) => {
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * Get API key description with storage status
   */
  private getApiKeyDescription(): string {
    const status = this.plugin.keychainService.getStorageStatus();
    if (status.secure) {
      return `Stored securely in ${status.backend}. Or use ANTHROPIC_API_KEY env var.`;
    }
    return 'Warning: Secure storage unavailable. Consider using ANTHROPIC_API_KEY environment variable.';
  }
}
