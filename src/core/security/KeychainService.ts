import { Plugin } from 'obsidian';

/**
 * Type definition for Electron's safeStorage API
 */
interface SafeStorageAPI {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

/**
 * Secure storage service using Electron's safeStorage API
 *
 * Security model:
 * - Primary: Electron safeStorage (uses OS keychain)
 *   - macOS: Keychain Access
 *   - Windows: DPAPI (Windows Credential Manager)
 *   - Linux: libsecret (GNOME Keyring / KWallet)
 * - Fallback: Environment variables (ANTHROPIC_API_KEY)
 * - Last resort: Obfuscated storage with user warning
 *
 * NEVER stores plaintext API keys in data.json
 */
export class KeychainService {
  private plugin: Plugin;
  private static readonly STORAGE_KEY_PREFIX = 'obsidian-cc';

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Get safeStorage from Electron
   * Returns null if not available
   */
  private getSafeStorage(): SafeStorageAPI | null {
    try {
      // Access Electron through require (available in Obsidian's Electron context)
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
      const electron = (window as any).require?.('electron');
      if (!electron) return null;
      return electron.safeStorage || electron.remote?.safeStorage || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if secure storage is available
   */
  isSecureStorageAvailable(): boolean {
    const safeStorage = this.getSafeStorage();
    return safeStorage?.isEncryptionAvailable?.() ?? false;
  }

  /**
   * Get storage backend information
   */
  getStorageStatus(): { secure: boolean; backend: string } {
    const safeStorage = this.getSafeStorage();

    if (!safeStorage) {
      return { secure: false, backend: 'unavailable' };
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return { secure: false, backend: 'encryption-unavailable' };
    }

    // Determine backend based on platform
    const platform = process.platform;
    switch (platform) {
      case 'darwin':
        return { secure: true, backend: 'macOS Keychain' };
      case 'win32':
        return { secure: true, backend: 'Windows DPAPI' };
      case 'linux':
        // On Linux, check if we have a proper secret service
        const backend = safeStorage.getSelectedStorageBackend?.() || 'libsecret';
        const isSecure = backend !== 'basic_text';
        return { secure: isSecure, backend };
      default:
        return { secure: true, backend: platform };
    }
  }

  /**
   * Store API key securely
   */
  async storeApiKey(key: string): Promise<void> {
    await this.storeSecurely('anthropic-api-key', key);
  }

  /**
   * Retrieve API key
   * Priority: 1) Keychain 2) Environment variable 3) Fallback storage
   */
  async getApiKey(): Promise<string | null> {
    // First, check environment variable
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey && envKey.length > 0) {
      return envKey;
    }

    // Then check secure storage
    return this.retrieveSecurely('anthropic-api-key');
  }

  /**
   * Delete API key from storage
   */
  async deleteApiKey(): Promise<void> {
    await this.deleteSecurely('anthropic-api-key');
  }

  /**
   * Store GitHub token securely
   */
  async storeGitHubToken(token: string): Promise<void> {
    await this.storeSecurely('github-token', token);
  }

  /**
   * Retrieve GitHub token
   */
  async getGitHubToken(): Promise<string | null> {
    const envToken = process.env.GITHUB_TOKEN;
    if (envToken && envToken.length > 0) {
      return envToken;
    }
    return this.retrieveSecurely('github-token');
  }

  /**
   * Delete GitHub token
   */
  async deleteGitHubToken(): Promise<void> {
    await this.deleteSecurely('github-token');
  }

  /**
   * Store a value securely using safeStorage
   */
  private async storeSecurely(key: string, value: string): Promise<void> {
    const storageKey = `${KeychainService.STORAGE_KEY_PREFIX}-${key}`;
    const safeStorage = this.getSafeStorage();

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      // Use secure encryption
      const encrypted = safeStorage.encryptString(value);
      await this.saveToPluginData(storageKey, {
        type: 'encrypted',
        data: encrypted.toString('base64'),
      });
    } else {
      // Fallback: basic obfuscation (NOT secure, warns user)
      console.warn(
        'Obsidian CC: Secure storage unavailable. Using fallback storage. ' +
          'Consider using environment variables instead.'
      );
      const obfuscated = Buffer.from(value).toString('base64');
      await this.saveToPluginData(storageKey, {
        type: 'obfuscated',
        data: obfuscated,
      });
    }
  }

  /**
   * Retrieve a value from secure storage
   */
  private async retrieveSecurely(key: string): Promise<string | null> {
    const storageKey = `${KeychainService.STORAGE_KEY_PREFIX}-${key}`;
    const stored = await this.loadFromPluginData(storageKey);

    if (!stored) {
      return null;
    }

    const safeStorage = this.getSafeStorage();

    if (stored.type === 'encrypted') {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
        console.error(
          'Obsidian CC: Cannot decrypt stored value - encryption unavailable'
        );
        return null;
      }

      try {
        const buffer = Buffer.from(stored.data, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (error) {
        console.error('Obsidian CC: Failed to decrypt stored value:', error);
        return null;
      }
    } else if (stored.type === 'obfuscated') {
      // Fallback: decode obfuscated value
      try {
        return Buffer.from(stored.data, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Delete a value from storage
   */
  private async deleteSecurely(key: string): Promise<void> {
    const storageKey = `${KeychainService.STORAGE_KEY_PREFIX}-${key}`;
    const data = (await this.plugin.loadData()) || {};
    delete data[storageKey];
    await this.plugin.saveData(data);
  }

  /**
   * Save to plugin data storage
   */
  private async saveToPluginData(
    key: string,
    value: { type: string; data: string }
  ): Promise<void> {
    const data = (await this.plugin.loadData()) || {};
    data[key] = value;
    await this.plugin.saveData(data);
  }

  /**
   * Load from plugin data storage
   */
  private async loadFromPluginData(
    key: string
  ): Promise<{ type: string; data: string } | null> {
    const data = await this.plugin.loadData();
    return data?.[key] || null;
  }

  /**
   * Check if any credentials are stored
   */
  async hasStoredCredentials(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return apiKey !== null && apiKey.length > 0;
  }

  /**
   * Validate API key format (basic check)
   */
  validateApiKeyFormat(key: string): boolean {
    // Anthropic API keys start with 'sk-ant-'
    return key.startsWith('sk-ant-') && key.length > 20;
  }

  /**
   * Mask API key for display
   */
  maskApiKey(key: string): string {
    if (key.length <= 12) {
      return '********';
    }
    return key.substring(0, 7) + '...' + key.substring(key.length - 4);
  }
}
