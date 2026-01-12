/**
 * Obsidian CC MCP Server
 *
 * Exposes vault operations to Claude Code and Claude Desktop
 * via the Model Context Protocol.
 */

import { App, TFile, TFolder, normalizePath, Notice } from 'obsidian';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { PathValidator } from './security/PathValidator';
import { AuditLogger } from './security/AuditLogger';
import { OperationGuard } from './security/OperationGuard';
import { QMDClient } from './integrations/QMDClient';
import { TasksAdapter } from './integrations/TasksAdapter';
import { ToolResponse, NoteMetadata, MCPOperation } from './types';
import type { ObsidianCCSettings } from '../settings/SettingsSchema';

/**
 * Allowed CORS origins (localhost only for security)
 */
const ALLOWED_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
  'app://obsidian.md',
];

/**
 * MCP Server for Obsidian vault operations
 */
export class MCPServer {
  private app: App;
  private settings: ObsidianCCSettings;
  private server: Server | null = null;
  private pathValidator: PathValidator;
  private auditLogger: AuditLogger;
  private operationGuard: OperationGuard;
  private qmdClient: QMDClient;
  private tasksAdapter: TasksAdapter;
  private isRunning = false;

  /** Auth token for MCP requests - generated on server start */
  private authToken: string = '';

  /** Rate limiting: requests per IP */
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly rateLimit = 100; // requests per minute

  constructor(app: App, settings: ObsidianCCSettings) {
    this.app = app;
    this.settings = settings;

    // Get vault path
    const vaultPath = (this.app.vault.adapter as any).basePath;

    // Initialize security components
    this.pathValidator = new PathValidator(vaultPath);
    this.auditLogger = new AuditLogger(settings);
    this.operationGuard = new OperationGuard(app, settings, this.auditLogger);

    // Initialize integrations
    this.qmdClient = new QMDClient(vaultPath, settings);
    this.tasksAdapter = new TasksAdapter(this.app.vault, settings);
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // Generate auth token for this session
    this.authToken = randomUUID();

    // Initialize QMD client
    await this.qmdClient.initialize();

    // Create HTTP server
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    const port = this.settings.mcpServerPort || 3333;

    return new Promise((resolve, reject) => {
      this.server!.listen(port, '127.0.0.1', () => {
        this.isRunning = true;
        console.log(`Obsidian CC MCP server started on port ${port}`);
        console.log(`Auth token: ${this.authToken}`);
        resolve();
      });

      this.server!.on('error', (error) => {
        console.error('MCP server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.operationGuard.cancelAll();
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log('Obsidian CC MCP server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Security: Validate origin (CORS)
    const origin = req.headers.origin || '';
    const isAllowedOrigin = !origin || ALLOWED_ORIGINS.some(allowed =>
      origin.startsWith(allowed)
    );

    if (isAllowedOrigin && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!this.checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    // Only allow POST for tool calls
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Parse URL
    const url = new URL(req.url || '/', `http://127.0.0.1`);
    const pathname = url.pathname;

    try {
      // Health endpoint doesn't require auth
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', vault: this.app.vault.getName() }));
        return;
      }

      // Auth token endpoint (returns token for configuration)
      if (pathname === '/auth/token' && req.method === 'GET') {
        // Only allow from localhost without auth for initial setup
        if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token: this.authToken }));
          return;
        }
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }

      // All other endpoints require authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Unauthorized',
          hint: 'Get token from /auth/token or check Obsidian CC settings'
        }));
        return;
      }

      // Route authenticated requests
      if (pathname === '/mcp/tools' && req.method === 'GET') {
        const tools = this.getToolDefinitions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tools }));
        return;
      }

      if (pathname === '/mcp/call' && req.method === 'POST') {
        const body = await this.readBody(req);

        // Safe JSON parsing
        let parsed: { tool?: string; arguments?: Record<string, unknown> };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        if (!parsed.tool || typeof parsed.tool !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid "tool" parameter' }));
          return;
        }

        const result = await this.executeTool(parsed.tool, parsed.arguments || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // 404 for unknown paths
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('MCP request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  /**
   * Check rate limit for client
   */
  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const record = this.requestCounts.get(clientId);

    if (!record || now > record.resetTime) {
      this.requestCounts.set(clientId, { count: 1, resetTime: now + 60000 });
      return true;
    }

    if (record.count >= this.rateLimit) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Read request body with proper size limiting
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      let rejected = false;
      const maxSize = 10 * 1024 * 1024; // 10MB

      req.on('data', (chunk) => {
        if (rejected) return;
        body += chunk;
        if (body.length > maxSize) {
          rejected = true;
          req.destroy();
          reject(new Error('Request body too large'));
        }
      });
      req.on('end', () => !rejected && resolve(body));
      req.on('error', (e) => !rejected && reject(e));
    });
  }

  /**
   * Get tool definitions for MCP
   */
  private getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return [
      {
        name: 'read_note',
        description: 'Read the content of a note from the Obsidian vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note relative to vault root (e.g., "folder/note.md")',
            },
            includeMetadata: {
              type: 'boolean',
              description: 'Include frontmatter metadata in response',
              default: false,
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_note',
        description: 'Create or update a note in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path for the note relative to vault root',
            },
            content: {
              type: 'string',
              description: 'Full markdown content to write',
            },
            mode: {
              type: 'string',
              enum: ['create', 'replace', 'append'],
              description: 'Write mode: create (new only), replace (overwrite), append',
              default: 'replace',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'search_vault',
        description: 'Search the vault using QMD semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query',
            },
            mode: {
              type: 'string',
              enum: ['hybrid', 'semantic', 'keyword'],
              description: 'Search mode',
              default: 'hybrid',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_notes',
        description: 'List notes in the vault or a specific folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'Folder path to list (empty for root)',
              default: '',
            },
            recursive: {
              type: 'boolean',
              description: 'Include notes in subfolders',
              default: false,
            },
            includeMetadata: {
              type: 'boolean',
              description: 'Include basic metadata',
              default: false,
            },
          },
        },
      },
      {
        name: 'list_tasks',
        description: 'List tasks from the vault with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['incomplete', 'complete', 'all'],
              description: 'Filter by task status',
              default: 'incomplete',
            },
            overdue: {
              type: 'boolean',
              description: 'Only show overdue tasks',
              default: false,
            },
            dueToday: {
              type: 'boolean',
              description: 'Only show tasks due today',
              default: false,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 50,
            },
          },
        },
      },
      {
        name: 'add_task',
        description: 'Add a new task to a note',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Task description',
            },
            dueDate: {
              type: 'string',
              description: 'Due date in YYYY-MM-DD format',
            },
            priority: {
              type: 'string',
              enum: ['highest', 'high', 'medium', 'low', 'lowest'],
              description: 'Task priority',
            },
            notePath: {
              type: 'string',
              description: 'Note to add task to',
            },
          },
          required: ['description', 'notePath'],
        },
      },
      {
        name: 'complete_task',
        description: 'Mark a task as complete',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Task identifier (filePath:lineNumber)',
            },
          },
          required: ['taskId'],
        },
      },
    ];
  }

  /**
   * Execute a tool
   */
  private async executeTool(tool: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const operation: MCPOperation = {
      tool,
      path: args.path as string,
      action: args.mode as string,
      timestamp: Date.now(),
    };

    try {
      switch (tool) {
        case 'read_note':
          return await this.readNote(args.path as string, args.includeMetadata as boolean);

        case 'write_note':
          return await this.operationGuard.executeWithApproval(operation, () =>
            this.writeNote(args.path as string, args.content as string, args.mode as string)
          );

        case 'search_vault':
          return await this.searchVault(
            args.query as string,
            args.mode as 'hybrid' | 'semantic' | 'keyword',
            args.limit as number
          );

        case 'list_notes':
          return await this.listNotes(
            args.folder as string,
            args.recursive as boolean,
            args.includeMetadata as boolean
          );

        case 'list_tasks':
          return await this.listTasks(args);

        case 'add_task':
          return await this.operationGuard.executeWithApproval(operation, () =>
            this.addTask(args)
          );

        case 'complete_task':
          return await this.operationGuard.executeWithApproval(operation, () =>
            this.completeTask(args.taskId as string)
          );

        default:
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${tool}` }) }],
            isError: true,
          };
      }
    } catch (error) {
      this.auditLogger.logToolCall(tool, args.path as string, false, String(error));
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true,
      };
    }
  }

  /**
   * Read a note
   */
  private async readNote(path: string, includeMetadata = false): Promise<ToolResponse> {
    const validation = this.pathValidator.validateWithExtension(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const file = this.app.vault.getAbstractFileByPath(validation.sanitizedPath!);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${path}`);
    }

    const content = await this.app.vault.read(file);
    this.auditLogger.logToolCall('read_note', path, true);

    const result: Record<string, unknown> = { content };

    if (includeMetadata) {
      const metadata = this.app.metadataCache.getFileCache(file);
      result.metadata = {
        path: file.path,
        name: file.name,
        size: file.stat.size,
        created: file.stat.ctime,
        modified: file.stat.mtime,
        frontmatter: metadata?.frontmatter,
        tags: metadata?.tags?.map((t) => t.tag),
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  /**
   * Write a note
   */
  private async writeNote(path: string, content: string, mode = 'replace'): Promise<ToolResponse> {
    const validation = this.pathValidator.validateWithExtension(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.sanitizedPath!;
    const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (mode === 'create' && existingFile) {
      throw new Error(`Note already exists: ${path}`);
    }

    if (mode === 'append') {
      if (!(existingFile instanceof TFile)) {
        throw new Error(`Note not found for append: ${path}`);
      }
      const existing = await this.app.vault.read(existingFile);
      content = existing + '\n' + content;
    }

    // Create parent folders if needed
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    if (folderPath) {
      await this.ensureFolder(folderPath);
    }

    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(normalizedPath, content);
    }

    this.auditLogger.logToolCall('write_note', path, true);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            path: normalizedPath,
            mode,
            uri: `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(normalizedPath.replace(/\.md$/, ''))}`,
          }),
        },
      ],
    };
  }

  /**
   * Ensure folder exists
   */
  private async ensureFolder(path: string): Promise<void> {
    const validation = this.pathValidator.validateFolder(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const existing = this.app.vault.getAbstractFileByPath(validation.sanitizedPath!);
    if (!existing) {
      await this.app.vault.createFolder(validation.sanitizedPath!);
    }
  }

  /**
   * Search vault using QMD
   */
  private async searchVault(
    query: string,
    mode: 'hybrid' | 'semantic' | 'keyword' = 'hybrid',
    limit = 10
  ): Promise<ToolResponse> {
    const isAvailable = await this.qmdClient.isAvailable();
    if (!isAvailable) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'QMD is not available',
              instructions: this.qmdClient.getInstallInstructions(),
            }),
          },
        ],
        isError: true,
      };
    }

    const results = await this.qmdClient.search(query, { mode, limit });
    this.auditLogger.logToolCall('search_vault', undefined, true);

    return {
      content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }],
    };
  }

  /**
   * List notes in folder
   */
  private async listNotes(
    folder = '',
    recursive = false,
    includeMetadata = false
  ): Promise<ToolResponse> {
    const validation = this.pathValidator.validateFolder(folder);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const files = this.app.vault.getMarkdownFiles();
    const folderPath = validation.sanitizedPath || '';

    const filtered = files.filter((file) => {
      if (!folderPath) {
        return recursive || !file.path.includes('/');
      }
      if (recursive) {
        return file.path.startsWith(folderPath + '/');
      }
      const relativePath = file.path.slice(folderPath.length + 1);
      return file.path.startsWith(folderPath + '/') && !relativePath.includes('/');
    });

    const notes = filtered.map((file) => {
      const base: Record<string, unknown> = {
        path: file.path,
        name: file.basename,
      };

      if (includeMetadata) {
        base.size = file.stat.size;
        base.created = file.stat.ctime;
        base.modified = file.stat.mtime;
      }

      return base;
    });

    this.auditLogger.logToolCall('list_notes', folder, true);

    return {
      content: [{ type: 'text', text: JSON.stringify({ notes }, null, 2) }],
    };
  }

  /**
   * List tasks
   */
  private async listTasks(args: Record<string, unknown>): Promise<ToolResponse> {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await this.tasksAdapter.queryTasks({
      status: args.status as 'incomplete' | 'complete' | 'all',
      overdue: args.overdue as boolean,
      dueBefore: args.dueToday ? today : undefined,
      dueAfter: args.dueToday ? today : undefined,
      limit: args.limit as number,
    });

    this.auditLogger.logToolCall('list_tasks', undefined, true);

    return {
      content: [{ type: 'text', text: JSON.stringify({ tasks }, null, 2) }],
    };
  }

  /**
   * Add a task
   */
  private async addTask(args: Record<string, unknown>): Promise<ToolResponse> {
    const validation = this.pathValidator.validateWithExtension(args.notePath as string);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const task = await this.tasksAdapter.addTask(
      {
        description: args.description as string,
        dueDate: args.dueDate as string,
        priority: args.priority as any,
        tags: args.tags as string[],
      },
      validation.sanitizedPath!
    );

    this.auditLogger.logToolCall('add_task', args.notePath as string, true);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            task,
            uri: `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(validation.sanitizedPath!.replace(/\.md$/, ''))}`,
          }),
        },
      ],
    };
  }

  /**
   * Complete a task
   */
  private async completeTask(taskId: string): Promise<ToolResponse> {
    const task = await this.tasksAdapter.completeTask(taskId);

    this.auditLogger.logToolCall('complete_task', taskId, true);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, task }),
        },
      ],
    };
  }

  /**
   * Update settings
   */
  async updateSettings(settings: ObsidianCCSettings): Promise<void> {
    this.settings = settings;
    this.auditLogger.updateSettings(settings);
    this.operationGuard.updateSettings(settings);
    await this.qmdClient.updateSettings(settings);
    this.tasksAdapter.updateSettings(settings);
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.settings.mcpServerPort || 3333;
  }

  /**
   * Get auth token (for display in settings)
   */
  getAuthToken(): string {
    return this.authToken;
  }
}
