/**
 * QMD semantic search client
 *
 * Integrates with Tobi Lütke's QMD for local semantic search.
 * https://github.com/tobi/qmd
 */

import * as fs from 'fs';
import { SearchResult, SearchOptions } from '../types';
import { execFileNoThrow, findCommand } from '../../utils/execFileNoThrow';
import type { ObsidianCCSettings } from '../../settings/SettingsSchema';

export class QMDClient {
  private qmdPath: string | null = null;
  private vaultPath: string;
  private settings: ObsidianCCSettings;
  private isIndexed = false;

  constructor(vaultPath: string, settings: ObsidianCCSettings) {
    this.vaultPath = vaultPath;
    this.settings = settings;
  }

  /**
   * Initialize and detect QMD binary location
   */
  async initialize(): Promise<void> {
    this.qmdPath = await this.detectQMD();
  }

  /**
   * Detect QMD binary location
   */
  private async detectQMD(): Promise<string | null> {
    // Check settings first
    if (this.settings.qmdPath && fs.existsSync(this.settings.qmdPath)) {
      return this.settings.qmdPath;
    }

    // Use safe command finder
    return findCommand('qmd', [
      `${process.env.HOME}/.bun/bin/qmd`,
    ]);
  }

  /**
   * Check if QMD is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.qmdPath) {
      this.qmdPath = await this.detectQMD();
    }

    if (!this.qmdPath) {
      return false;
    }

    const result = await execFileNoThrow(this.qmdPath, ['--version'], {
      timeout: 5000,
    });
    return result.status === 'success';
  }

  /**
   * Get QMD version
   */
  async getVersion(): Promise<string | null> {
    if (!this.qmdPath) {
      return null;
    }

    const result = await execFileNoThrow(this.qmdPath, ['--version'], {
      timeout: 5000,
    });

    if (result.status === 'success') {
      return result.stdout.trim();
    }
    return null;
  }

  /**
   * Check if vault is indexed
   */
  async isVaultIndexed(): Promise<boolean> {
    if (!this.qmdPath) {
      return false;
    }

    try {
      // Check for .qmd directory
      const qmdDir = `${this.vaultPath}/.qmd`;
      return fs.existsSync(qmdDir);
    } catch {
      return false;
    }
  }

  /**
   * Index the vault
   */
  async index(): Promise<void> {
    if (!this.qmdPath) {
      throw new Error('QMD is not available');
    }

    const result = await execFileNoThrow(this.qmdPath, ['index'], {
      cwd: this.vaultPath,
      timeout: 300000, // 5 minutes for large vaults
    });

    if (result.status === 'error') {
      throw new Error(`Failed to index vault: ${result.stderr || result.error?.message}`);
    }

    this.isIndexed = true;
  }

  /**
   * Perform semantic search
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.qmdPath) {
      throw new Error('QMD is not available');
    }

    if (!this.settings.qmdEnabled) {
      throw new Error('QMD is disabled in settings');
    }

    const mode = options.mode || this.settings.searchMode || 'hybrid';
    const limit = options.limit || this.settings.maxSearchResults || 10;

    // Build command arguments safely (no shell injection possible with execFile)
    const args: string[] = ['search'];

    // Add mode flag
    switch (mode) {
      case 'semantic':
        args.push('--semantic');
        break;
      case 'keyword':
        args.push('--keyword');
        break;
      case 'hybrid':
      default:
        // Hybrid is default, no flag needed
        break;
    }

    // Add limit
    args.push('--limit', limit.toString());

    // Add folder filter
    if (options.folder) {
      args.push('--path', options.folder);
    }

    // Add JSON output
    args.push('--json');

    // Add query as separate argument (safely escaped by execFile)
    args.push(query);

    const result = await execFileNoThrow(this.qmdPath, args, {
      cwd: this.vaultPath,
      timeout: 30000,
    });

    if (result.status === 'error') {
      throw new Error(`Search failed: ${result.stderr || result.error?.message}`);
    }

    try {
      // Parse JSON output
      const results = JSON.parse(result.stdout);

      // Normalize results
      return results.map((r: Record<string, unknown>) => ({
        path: r.path || r.file || '',
        score: r.score || r.similarity || 0,
        snippet: r.snippet || r.content || '',
        title: r.title || this.extractTitle(r.path as string) || '',
        highlights: r.highlights || [],
      }));
    } catch (parseError) {
      // If JSON parse fails, try line-by-line parsing
      return this.parseTextOutput(result.stdout);
    }
  }

  /**
   * Fallback: parse text output from QMD
   */
  private parseTextOutput(stdout: string): SearchResult[] {
    const lines = stdout.trim().split('\n');
    const results: SearchResult[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse common output formats
      const match = line.match(/^(.+\.md):?\s*(.*)$/);
      if (match) {
        results.push({
          path: match[1],
          score: 1.0, // No score available in text output
          snippet: match[2] || '',
          title: this.extractTitle(match[1]),
        });
      }
    }

    return results;
  }

  /**
   * Extract title from file path
   */
  private extractTitle(filePath: string): string {
    if (!filePath) return '';
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.md$/, '');
  }

  /**
   * Update settings reference
   */
  async updateSettings(settings: ObsidianCCSettings): Promise<void> {
    this.settings = settings;
    // Re-detect QMD if path changed
    if (settings.qmdPath !== this.qmdPath) {
      this.qmdPath = await this.detectQMD();
    }
  }

  /**
   * Get QMD path
   */
  getQMDPath(): string | null {
    return this.qmdPath;
  }

  /**
   * Get installation instructions
   */
  getInstallInstructions(): string {
    return `QMD is not installed. Install it with:

bun install -g https://github.com/tobi/qmd

Or visit: https://github.com/tobi/qmd`;
  }
}
