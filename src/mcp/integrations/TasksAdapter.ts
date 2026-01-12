/**
 * Obsidian Tasks plugin adapter
 *
 * Parses and formats tasks in Obsidian Tasks plugin format.
 * https://github.com/obsidian-tasks-group/obsidian-tasks
 */

import { TFile, Vault } from 'obsidian';
import { ParsedTask, TaskData, TaskQuery } from '../types';
import type { ObsidianCCSettings } from '../../settings/SettingsSchema';

/**
 * Priority emoji mappings
 */
const PRIORITY_EMOJI: Record<string, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};

const EMOJI_TO_PRIORITY: Record<string, ParsedTask['priority']> = {
  '🔺': 'highest',
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};

/**
 * Task regex patterns for different formats
 */
const TASK_PATTERNS = {
  // Obsidian Tasks format: - [ ] Task 📅 2024-01-15 ⏫
  obsidianTasks: /^(\s*)-\s*\[([ xX])\]\s*(.+)$/,
  // Dataview inline fields: - [ ] Task [due:: 2024-01-15]
  dataview: /^(\s*)-\s*\[([ xX])\]\s*(.+)$/,
  // Basic markdown: - [ ] Task
  basic: /^(\s*)-\s*\[([ xX])\]\s*(.+)$/,
};

/**
 * Date field patterns
 */
const DATE_PATTERNS = {
  due: /(?:📅|due::?\s*)(\d{4}-\d{2}-\d{2})/i,
  scheduled: /(?:⏳|scheduled::?\s*)(\d{4}-\d{2}-\d{2})/i,
  start: /(?:🛫|start::?\s*)(\d{4}-\d{2}-\d{2})/i,
  done: /(?:✅|done::?\s*)(\d{4}-\d{2}-\d{2})/i,
  created: /(?:➕|created::?\s*)(\d{4}-\d{2}-\d{2})/i,
};

/**
 * Recurrence pattern
 */
const RECURRENCE_PATTERN = /(?:🔁|recurrence::?\s*)([^📅⏳🛫✅➕🔺⏫🔼🔽⏬\[\]]+)/i;

/**
 * Tag pattern
 */
const TAG_PATTERN = /#[\w\-/]+/g;

export class TasksAdapter {
  private vault: Vault;
  private settings: ObsidianCCSettings;

  constructor(vault: Vault, settings: ObsidianCCSettings) {
    this.vault = vault;
    this.settings = settings;
  }

  /**
   * Parse a task line into structured data
   */
  parseTask(line: string, filePath: string, lineNumber: number): ParsedTask | null {
    // Map settings format to pattern key
    const formatKey = this.settings.taskFormat === 'obsidian-tasks' ? 'obsidianTasks' : this.settings.taskFormat;
    const pattern = TASK_PATTERNS[formatKey as keyof typeof TASK_PATTERNS] || TASK_PATTERNS.obsidianTasks;
    const match = line.match(pattern);

    if (!match) {
      return null;
    }

    const [, indent, checkbox, content] = match;
    const completed = checkbox.toLowerCase() === 'x';

    // Extract dates
    const dueMatch = content.match(DATE_PATTERNS.due);
    const scheduledMatch = content.match(DATE_PATTERNS.scheduled);
    const startMatch = content.match(DATE_PATTERNS.start);
    const doneMatch = content.match(DATE_PATTERNS.done);

    // Extract priority
    let priority: ParsedTask['priority'] | undefined;
    for (const [emoji, p] of Object.entries(EMOJI_TO_PRIORITY)) {
      if (content.includes(emoji)) {
        priority = p;
        break;
      }
    }
    // Also check dataview format
    const priorityMatch = content.match(/priority::?\s*(highest|high|medium|low|lowest)/i);
    if (priorityMatch) {
      priority = priorityMatch[1].toLowerCase() as ParsedTask['priority'];
    }

    // Extract recurrence
    const recurrenceMatch = content.match(RECURRENCE_PATTERN);

    // Extract tags
    const tags = content.match(TAG_PATTERN) || [];

    // Clean description (remove metadata)
    let description = content
      .replace(DATE_PATTERNS.due, '')
      .replace(DATE_PATTERNS.scheduled, '')
      .replace(DATE_PATTERNS.start, '')
      .replace(DATE_PATTERNS.done, '')
      .replace(DATE_PATTERNS.created, '')
      .replace(RECURRENCE_PATTERN, '')
      .replace(/\[priority::\s*\w+\]/gi, '');

    // Remove priority emojis
    for (const emoji of Object.keys(EMOJI_TO_PRIORITY)) {
      description = description.replace(emoji, '');
    }

    description = description.trim();

    return {
      id: `${filePath}:${lineNumber}`,
      description,
      completed,
      dueDate: dueMatch?.[1],
      scheduledDate: scheduledMatch?.[1],
      startDate: startMatch?.[1],
      doneDate: doneMatch?.[1],
      priority,
      recurrence: recurrenceMatch?.[1]?.trim(),
      tags: tags.map((t) => t.slice(1)), // Remove # prefix
      filePath,
      lineNumber,
      rawLine: line,
    };
  }

  /**
   * Format task data into a task line
   */
  formatTask(task: TaskData, completed = false): string {
    const parts: string[] = [];

    // Checkbox
    parts.push(completed ? '- [x]' : '- [ ]');

    // Description
    parts.push(task.description);

    // Tags
    if (task.tags && task.tags.length > 0) {
      parts.push(task.tags.map((t) => `#${t}`).join(' '));
    }

    // Priority
    if (task.priority && PRIORITY_EMOJI[task.priority]) {
      parts.push(PRIORITY_EMOJI[task.priority]);
    }

    // Dates
    if (task.dueDate) {
      parts.push(`📅 ${task.dueDate}`);
    }
    if (task.scheduledDate) {
      parts.push(`⏳ ${task.scheduledDate}`);
    }
    if (task.startDate) {
      parts.push(`🛫 ${task.startDate}`);
    }

    // Recurrence
    if (task.recurrence) {
      parts.push(`🔁 ${task.recurrence}`);
    }

    return parts.join(' ');
  }

  /**
   * Query tasks across the vault
   */
  async queryTasks(query: TaskQuery = {}): Promise<ParsedTask[]> {
    const tasks: ParsedTask[] = [];
    const files = this.vault.getMarkdownFiles();
    const today = new Date().toISOString().split('T')[0];

    for (const file of files) {
      // Filter by note path
      if (query.inNote && file.path !== query.inNote) {
        continue;
      }

      const content = await this.vault.read(file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const task = this.parseTask(lines[i], file.path, i + 1);
        if (!task) continue;

        // Apply filters
        if (!this.matchesQuery(task, query, today)) {
          continue;
        }

        tasks.push(task);
      }
    }

    // Sort by due date, then by priority
    tasks.sort((a, b) => {
      // Incomplete first
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      // Due date (earlier first, no date last)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    // Apply limit
    if (query.limit && query.limit > 0) {
      return tasks.slice(0, query.limit);
    }

    return tasks;
  }

  /**
   * Check if task matches query filters
   */
  private matchesQuery(task: ParsedTask, query: TaskQuery, today: string): boolean {
    // Status filter
    if (query.status === 'incomplete' && task.completed) return false;
    if (query.status === 'complete' && !task.completed) return false;

    // Overdue filter
    if (query.overdue) {
      if (!task.dueDate || task.dueDate >= today || task.completed) {
        return false;
      }
    }

    // Due before filter
    if (query.dueBefore && task.dueDate) {
      if (task.dueDate > query.dueBefore) return false;
    }

    // Due after filter
    if (query.dueAfter && task.dueDate) {
      if (task.dueDate < query.dueAfter) return false;
    }

    // Priority filter
    if (query.priority && task.priority !== query.priority) {
      return false;
    }

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      const hasMatchingTag = query.tags.some((t) =>
        task.tags.includes(t.replace(/^#/, ''))
      );
      if (!hasMatchingTag) return false;
    }

    return true;
  }

  /**
   * Add a task to a note
   */
  async addTask(task: TaskData, notePath: string): Promise<ParsedTask> {
    const file = this.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${notePath}`);
    }

    const content = await this.vault.read(file);
    const taskLine = this.formatTask(task);
    const newContent = content + '\n' + taskLine;

    await this.vault.modify(file, newContent);

    const lineNumber = newContent.split('\n').length;
    return this.parseTask(taskLine, notePath, lineNumber)!;
  }

  /**
   * Complete a task by ID
   */
  async completeTask(taskId: string): Promise<ParsedTask | null> {
    const [filePath, lineStr] = taskId.split(':');
    const lineNumber = parseInt(lineStr, 10);

    const file = this.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${filePath}`);
    }

    const content = await this.vault.read(file);
    const lines = content.split('\n');
    const lineIndex = lineNumber - 1;

    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw new Error(`Invalid line number: ${lineNumber}`);
    }

    const task = this.parseTask(lines[lineIndex], filePath, lineNumber);
    if (!task) {
      throw new Error(`No task found at line ${lineNumber}`);
    }

    // Mark as complete
    lines[lineIndex] = lines[lineIndex].replace(/- \[ \]/, '- [x]');

    // Add completion date
    const today = new Date().toISOString().split('T')[0];
    if (!lines[lineIndex].includes('✅')) {
      lines[lineIndex] += ` ✅ ${today}`;
    }

    await this.vault.modify(file, lines.join('\n'));

    return this.parseTask(lines[lineIndex], filePath, lineNumber);
  }

  /**
   * Update settings
   */
  updateSettings(settings: ObsidianCCSettings): void {
    this.settings = settings;
  }
}
