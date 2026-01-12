/**
 * Path validation and sandboxing for MCP operations
 *
 * Ensures all file operations stay within the vault directory
 * and prevents directory traversal attacks.
 */

import { normalizePath } from 'obsidian';
import * as path from 'path';
import { PathValidationResult } from '../types';

/**
 * Allowed file extensions for MCP operations
 */
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv'];

/**
 * Dangerous path patterns to block
 */
const DANGEROUS_PATTERNS = [
  /\.\./,           // Parent directory traversal
  /^~\//,           // Home directory
  /^\$/,            // Environment variables
  /%2e%2e/i,        // URL-encoded ..
  /%252e%252e/i,    // Double URL-encoded ..
  /\x00/,           // Null byte
];

export class PathValidator {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Validate that a path is safe and within the vault
   */
  validate(requestedPath: string): PathValidationResult {
    // Basic checks
    if (!requestedPath || typeof requestedPath !== 'string') {
      return { valid: false, error: 'Path is required' };
    }

    // Check for empty path
    if (requestedPath.trim() === '') {
      return { valid: false, error: 'Path cannot be empty' };
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(requestedPath)) {
        return { valid: false, error: 'Path contains dangerous pattern' };
      }
    }

    // Reject absolute paths
    if (requestedPath.startsWith('/') || /^[A-Za-z]:/.test(requestedPath)) {
      return { valid: false, error: 'Absolute paths are not allowed' };
    }

    // Normalize the path
    const normalized = normalizePath(requestedPath);

    // Resolve to absolute and check it's within vault
    // SECURITY: Ensure vaultPath ends with separator to prevent /vault-evil matching /vault
    const vaultWithSep = this.vaultPath.endsWith('/') ? this.vaultPath : this.vaultPath + '/';
    const absolutePath = path.resolve(this.vaultPath, normalized);

    // Path must either be exactly the vault path or start with vault path + separator
    if (absolutePath !== this.vaultPath && !absolutePath.startsWith(vaultWithSep)) {
      return { valid: false, error: 'Path escapes vault directory' };
    }

    // Check for hidden files (starting with .)
    const parts = normalized.split('/');
    for (const part of parts) {
      if (part.startsWith('.') && part !== '.') {
        return { valid: false, error: 'Hidden files/folders are not allowed' };
      }
    }

    return { valid: true, sanitizedPath: normalized };
  }

  /**
   * Validate path with extension check
   */
  validateWithExtension(requestedPath: string, requireExtension = true): PathValidationResult {
    const result = this.validate(requestedPath);
    if (!result.valid) {
      return result;
    }

    const ext = path.extname(requestedPath).toLowerCase();

    // If no extension and we require one, add .md
    if (!ext && requireExtension) {
      const withMd = requestedPath + '.md';
      return { valid: true, sanitizedPath: normalizePath(withMd) };
    }

    // Check if extension is allowed
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Extension "${ext}" is not allowed` };
    }

    return result;
  }

  /**
   * Resolve a relative path to absolute path safely
   * Returns null if path is invalid
   */
  resolveSafe(relativePath: string): string | null {
    const result = this.validate(relativePath);
    if (!result.valid || !result.sanitizedPath) {
      return null;
    }
    return path.join(this.vaultPath, result.sanitizedPath);
  }

  /**
   * Check if a path exists within the vault
   */
  isWithinVault(absolutePath: string): boolean {
    const resolved = path.resolve(absolutePath);
    return resolved.startsWith(this.vaultPath);
  }

  /**
   * Sanitize a folder path (no extension check)
   */
  validateFolder(folderPath: string): PathValidationResult {
    if (!folderPath || folderPath === '') {
      // Root folder is valid
      return { valid: true, sanitizedPath: '' };
    }

    const result = this.validate(folderPath);
    if (!result.valid) {
      return result;
    }

    // Remove trailing slashes
    const sanitized = result.sanitizedPath!.replace(/\/+$/, '');
    return { valid: true, sanitizedPath: sanitized };
  }

  /**
   * Get vault path
   */
  getVaultPath(): string {
    return this.vaultPath;
  }
}
