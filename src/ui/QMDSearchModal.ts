import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import { QMDClient } from '../mcp/integrations/QMDClient';
import { SearchResult } from '../mcp/types';

/**
 * QMD Semantic Search Modal
 *
 * Beautiful search interface for Tobi's QMD.
 */
export class QMDSearchModal extends Modal {
  private qmdClient: QMDClient;
  private searchInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private results: SearchResult[] = [];
  private isSearching = false;

  constructor(app: App, qmdClient: QMDClient) {
    super(app);
    this.qmdClient = qmdClient;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('cc-qmd-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'cc-qmd-header' });
    header.createEl('h2', { text: '🔍 Semantic Search' });
    header.createEl('p', {
      text: 'Powered by QMD',
      cls: 'cc-qmd-subtitle'
    });

    // Check QMD availability
    const available = await this.qmdClient.isAvailable();
    if (!available) {
      this.showInstallPrompt(contentEl);
      return;
    }

    // Search input
    const searchContainer = contentEl.createDiv({ cls: 'cc-qmd-search-container' });
    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: 'Search your vault semantically...',
      cls: 'cc-qmd-search-input',
    });

    this.searchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !this.isSearching) {
        await this.performSearch();
      }
    });

    // Search button
    const searchBtn = searchContainer.createEl('button', {
      text: 'Search',
      cls: 'cc-qmd-search-btn',
    });
    searchBtn.addEventListener('click', () => this.performSearch());

    // Status
    this.statusEl = contentEl.createDiv({ cls: 'cc-qmd-status' });

    // Results container
    this.resultsContainer = contentEl.createDiv({ cls: 'cc-qmd-results' });

    // Focus input
    setTimeout(() => this.searchInput?.focus(), 50);

    // Check indexing status
    const indexed = await this.qmdClient.isVaultIndexed();
    if (!indexed) {
      this.showIndexPrompt();
    }
  }

  private showInstallPrompt(container: HTMLElement): void {
    const prompt = container.createDiv({ cls: 'cc-qmd-install-prompt' });
    prompt.createEl('h3', { text: 'QMD Not Found' });
    prompt.createEl('p', { text: 'Install QMD for semantic search:' });

    const code = prompt.createEl('pre');
    code.createEl('code', { text: 'bun install -g https://github.com/tobi/qmd' });

    const link = prompt.createEl('a', {
      text: 'Learn more about QMD →',
      href: 'https://github.com/tobi/qmd',
    });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://github.com/tobi/qmd', '_blank');
    });
  }

  private showIndexPrompt(): void {
    if (!this.statusEl) return;

    this.statusEl.empty();
    this.statusEl.addClass('cc-qmd-status-warning');

    const warning = this.statusEl.createDiv();
    warning.createEl('span', { text: '⚠️ Vault not indexed. ' });

    const indexBtn = warning.createEl('button', {
      text: 'Index Now',
      cls: 'cc-qmd-index-btn',
    });

    indexBtn.addEventListener('click', async () => {
      await this.indexVault();
    });
  }

  private async indexVault(): Promise<void> {
    if (!this.statusEl) return;

    this.statusEl.empty();
    this.statusEl.removeClass('cc-qmd-status-warning');
    this.statusEl.addClass('cc-qmd-status-indexing');
    this.statusEl.textContent = '⏳ Indexing vault... This may take a few minutes.';

    try {
      await this.qmdClient.index();
      this.statusEl.textContent = '✅ Vault indexed successfully!';
      this.statusEl.removeClass('cc-qmd-status-indexing');
      setTimeout(() => {
        if (this.statusEl) {
          this.statusEl.textContent = '';
        }
      }, 3000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.statusEl.textContent = `❌ Indexing failed: ${msg}`;
      this.statusEl.removeClass('cc-qmd-status-indexing');
      this.statusEl.addClass('cc-qmd-status-error');
    }
  }

  private async performSearch(): Promise<void> {
    if (!this.searchInput || !this.resultsContainer || !this.statusEl) return;

    const query = this.searchInput.value.trim();
    if (!query) {
      new Notice('Please enter a search query');
      return;
    }

    this.isSearching = true;
    this.statusEl.textContent = '🔍 Searching...';
    this.resultsContainer.empty();

    try {
      this.results = await this.qmdClient.search(query);
      this.statusEl.textContent = `Found ${this.results.length} results`;
      this.renderResults();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.statusEl.textContent = `❌ Search failed: ${msg}`;
      new Notice(`Search failed: ${msg}`);
    } finally {
      this.isSearching = false;
    }
  }

  private renderResults(): void {
    if (!this.resultsContainer) return;
    this.resultsContainer.empty();

    if (this.results.length === 0) {
      this.resultsContainer.createDiv({
        text: 'No results found. Try a different query.',
        cls: 'cc-qmd-no-results',
      });
      return;
    }

    for (const result of this.results) {
      const item = this.resultsContainer.createDiv({ cls: 'cc-qmd-result-item' });

      // Title row
      const titleRow = item.createDiv({ cls: 'cc-qmd-result-title-row' });
      const title = titleRow.createEl('span', {
        text: result.title || result.path,
        cls: 'cc-qmd-result-title',
      });

      // Score badge
      if (result.score) {
        const score = Math.round(result.score * 100);
        titleRow.createEl('span', {
          text: `${score}%`,
          cls: 'cc-qmd-result-score',
        });
      }

      // Snippet
      if (result.snippet) {
        item.createDiv({
          text: result.snippet.substring(0, 200) + (result.snippet.length > 200 ? '...' : ''),
          cls: 'cc-qmd-result-snippet',
        });
      }

      // Path
      item.createDiv({
        text: result.path,
        cls: 'cc-qmd-result-path',
      });

      // Click to open
      item.addEventListener('click', () => {
        this.openFile(result.path);
      });
    }
  }

  private async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(file);
      this.close();
    } else {
      new Notice(`File not found: ${path}`);
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
