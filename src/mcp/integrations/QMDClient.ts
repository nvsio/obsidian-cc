/**
 * QMD semantic search client
 *
 * Integrates with Tobi Lütke's QMD for local semantic search.
 * https://github.com/tobi/qmd
 */

import * as fs from 'fs';
import * as os from 'os';
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
   * Get the search path based on settings
   */
  getSearchPath(): string {
    if (this.settings.qmdSearchScope === 'home') {
      return process.env.HOME || this.vaultPath;
    }
    return this.vaultPath;
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
    // Check settings first (user-specified path)
    if (this.settings.qmdPath && fs.existsSync(this.settings.qmdPath)) {
      return this.settings.qmdPath;
    }

    // Use os.homedir() which works reliably in sandboxed environments
    const home = os.homedir();

    // Common QMD install locations
    const qmdPaths = [
      // Bun global install (primary install method for QMD)
      `${home}/.bun/bin/qmd`,
      // Standard Unix paths
      '/usr/local/bin/qmd',
      '/opt/homebrew/bin/qmd',
      `${home}/.local/bin/qmd`,
      '/usr/bin/qmd',
      // Cargo (if built from source)
      `${home}/.cargo/bin/qmd`,
    ];

    // Check each path - verify file exists and is executable
    for (const qmdPath of qmdPaths) {
      try {
        if (fs.existsSync(qmdPath)) {
          const result = await execFileNoThrow(qmdPath, ['--version'], { timeout: 5000 });
          if (result.status === 'success') {
            return qmdPath;
          }
        }
      } catch {
        // Continue to next path
      }
    }

    // Fallback: use 'which' to find in PATH
    return findCommand('qmd', []);
  }

  /**
   * Check if QMD is available - always re-detects
   */
  async isAvailable(): Promise<boolean> {
    // Always re-detect in case QMD was installed since last check
    this.qmdPath = await this.detectQMD();

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
   * Check if search path is indexed
   */
  async isVaultIndexed(): Promise<boolean> {
    if (!this.qmdPath) {
      return false;
    }

    try {
      // Check for .qmd directory in search path
      const searchPath = this.getSearchPath();
      const qmdDir = `${searchPath}/.qmd`;
      return fs.existsSync(qmdDir);
    } catch {
      return false;
    }
  }

  /**
   * Index the search path
   */
  async index(): Promise<void> {
    if (!this.qmdPath) {
      throw new Error('QMD is not available');
    }

    const searchPath = this.getSearchPath();
    const result = await execFileNoThrow(this.qmdPath, ['index'], {
      cwd: searchPath,
      timeout: 300000, // 5 minutes for large directories
    });

    if (result.status === 'error') {
      throw new Error(`Failed to index: ${result.stderr || result.error?.message}`);
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

    const searchPath = this.getSearchPath();
    const result = await execFileNoThrow(this.qmdPath, args, {
      cwd: searchPath,
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
