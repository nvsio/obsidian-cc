import DOMPurify from 'dompurify';
import { normalizePath } from 'obsidian';

/**
 * Input sanitization service for security
 *
 * Responsibilities:
 * - Sanitize HTML/Markdown content before rendering
 * - Validate file paths to prevent directory traversal
 * - Filter dangerous patterns from user input
 * - Ensure CSP compliance for rendered content
 */
export class InputSanitizer {
  private readonly purifyConfig: Record<string, unknown>;

  constructor() {
    this.purifyConfig = {
      // Safe HTML tags for markdown rendering
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
        'code', 'pre', 'kbd', 'samp',
        'ul', 'ol', 'li',
        'blockquote', 'hr',
        'a',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img',
        'span', 'div',
        'sup', 'sub',
        'details', 'summary',
      ],
      // Safe attributes
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title',
        'class', 'id',
        'colspan', 'rowspan',
        'data-href', // Obsidian internal links
      ],
      // Disable data attributes except specific ones
      ALLOW_DATA_ATTR: false,
      // Enable HTML profile
      USE_PROFILES: { html: true },
      // Block dangerous protocols
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|obsidian):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      // Don't allow SVG (attack vector)
      FORBID_TAGS: ['svg', 'math', 'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      // Don't allow event handlers
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    };
  }

  /**
   * Sanitize HTML content for safe rendering
   */
  sanitizeHTML(dirty: string): string {
    // Type assertion needed due to DOMPurify type definition issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return DOMPurify.sanitize(dirty, this.purifyConfig as any) as unknown as string;
  }

  /**
   * Sanitize markdown before parsing/rendering
   * Removes potentially dangerous patterns that could survive markdown parsing
   */
  sanitizeMarkdown(markdown: string): string {
    return markdown
      // Remove any script tags (in case markdown allows raw HTML)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, 'blocked:')
      // Remove data: URLs (except safe image types)
      .replace(/data:(?!image\/(png|jpeg|gif|webp);base64,)/gi, 'blocked:')
      // Remove on* event handlers in any remaining HTML
      .replace(/\s+on\w+\s*=/gi, ' data-blocked=')
      // Remove vbscript: protocol
      .replace(/vbscript:/gi, 'blocked:');
  }

  /**
   * Validate a file path is safe (no directory traversal)
   * Returns true if path is safe, false otherwise
   */
  validateFilePath(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }

    // Normalize the path
    const normalized = normalizePath(path);

    // Check for directory traversal attempts
    if (normalized.includes('..')) {
      return false;
    }

    // Check for absolute paths (should be relative to vault)
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      return false;
    }

    // Check for null bytes (path truncation attack)
    if (path.includes('\x00')) {
      return false;
    }

    // Check for other dangerous patterns
    const dangerousPatterns = [
      /\.\./,           // Parent directory
      /^~\//,           // Home directory
      /^\$/,            // Environment variables
      /%2e%2e/i,        // URL-encoded ..
      /%252e%252e/i,    // Double URL-encoded ..
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(path)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitize a file path (normalize and clean)
   * Returns null if path is unsafe
   */
  sanitizeFilePath(path: string): string | null {
    if (!this.validateFilePath(path)) {
      return null;
    }

    // Normalize and clean the path
    let cleaned = normalizePath(path);

    // Remove leading slashes
    cleaned = cleaned.replace(/^\/+/, '');

    // Remove null bytes
    cleaned = cleaned.replace(/\x00/g, '');

    return cleaned;
  }

  /**
   * Sanitize user prompt input
   * Removes potentially malicious content while preserving intent
   */
  sanitizePrompt(prompt: string): string {
    if (!prompt || typeof prompt !== 'string') {
      return '';
    }

    return prompt
      // Remove null bytes
      .replace(/\x00/g, '')
      // Normalize whitespace
      .replace(/[\r\n]+/g, '\n')
      // Limit consecutive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim
      .trim();
  }

  /**
   * Validate and sanitize a URL
   * Returns null if URL is unsafe
   */
  sanitizeURL(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      const parsed = new URL(url);

      // Only allow safe protocols
      const safeProtocols = ['https:', 'http:', 'obsidian:', 'mailto:'];
      if (!safeProtocols.includes(parsed.protocol)) {
        return null;
      }

      // Block localhost/internal IPs for external URLs (SSRF prevention)
      // Exception: localhost is allowed for QMD MCP server
      const hostname = parsed.hostname.toLowerCase();
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      // For non-localhost, block internal IPs
      if (!isLocalhost) {
        const internalPatterns = [
          /^10\./,
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
          /^192\.168\./,
          /^169\.254\./,
          /^127\./,
        ];

        for (const pattern of internalPatterns) {
          if (pattern.test(hostname)) {
            return null;
          }
        }
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }

  /**
   * Check if a hostname is in the allowlist
   */
  isAllowedHost(url: string, allowlist: string[]): boolean {
    try {
      const parsed = new URL(url);
      return allowlist.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  /**
   * Escape HTML entities (for text that shouldn't be HTML)
   */
  escapeHTML(text: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => escapeMap[char]);
  }

  /**
   * Strip all HTML tags (for plain text extraction)
   */
  stripHTML(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }) as unknown as string;
  }
}
