/**
 * Trigger types for @ mentions
 */
export type TriggerType = 'claude' | 'cc' | 'none';

/**
 * Parsed trigger result
 */
export interface ParsedTrigger {
  type: TriggerType;
  command: string;
  args: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Inline commands available for @claude
 */
export const INLINE_COMMANDS = [
  'summarize',
  'expand',
  'rewrite',
  'explain',
  'translate',
  'fix',
  'bullets',
  'table',
  'continue',
  'ask', // Free-form prompt
] as const;

export type InlineCommand = (typeof INLINE_COMMANDS)[number];

/**
 * Check if a string is a valid inline command
 */
export function isInlineCommand(cmd: string): cmd is InlineCommand {
  return INLINE_COMMANDS.includes(cmd as InlineCommand);
}

/**
 * Parse trigger patterns from text
 *
 * Patterns:
 * - @claude [command] [args]  -> Inline mode
 * - @cc [prompt]              -> Agentic mode
 *
 * Examples:
 * - @claude summarize         -> { type: 'claude', command: 'summarize', args: '' }
 * - @claude translate spanish -> { type: 'claude', command: 'translate', args: 'spanish' }
 * - @claude rewrite           -> { type: 'claude', command: 'rewrite', args: '' }
 * - @cc analyze this doc      -> { type: 'cc', command: '', args: 'analyze this doc' }
 */
export class TriggerParser {
  private claudeTrigger: string;
  private ccTrigger: string;

  constructor(claudeTrigger = '@claude', ccTrigger = '@cc') {
    this.claudeTrigger = claudeTrigger;
    this.ccTrigger = ccTrigger;
  }

  /**
   * Update trigger patterns
   */
  setTriggers(claudeTrigger: string, ccTrigger: string): void {
    this.claudeTrigger = claudeTrigger;
    this.ccTrigger = ccTrigger;
  }

  /**
   * Parse a line of text for triggers
   * Returns the first trigger found, or null if none
   */
  parseLine(line: string): ParsedTrigger | null {
    // Check for @claude trigger
    const claudeResult = this.parseClaudeTrigger(line);
    if (claudeResult) return claudeResult;

    // Check for @cc trigger
    const ccResult = this.parseCCTrigger(line);
    if (ccResult) return ccResult;

    return null;
  }

  /**
   * Parse @claude trigger
   * Format: @claude [command] [args] OR @claude [free-form prompt]
   */
  private parseClaudeTrigger(line: string): ParsedTrigger | null {
    const escapedTrigger = this.escapeRegex(this.claudeTrigger);

    // First try: @claude [command] [args]
    const commandPattern = new RegExp(
      `${escapedTrigger}\\s+(\\w+)(?:\\s+(.*))?$`,
      'i'
    );
    const commandMatch = line.match(commandPattern);

    if (commandMatch) {
      const startIndex = commandMatch.index!;
      const potentialCommand = commandMatch[1].toLowerCase();

      // Check if it's a known command
      if (isInlineCommand(potentialCommand)) {
        return {
          type: 'claude',
          command: potentialCommand,
          args: commandMatch[2]?.trim() || '',
          fullMatch: commandMatch[0],
          startIndex,
          endIndex: startIndex + commandMatch[0].length,
        };
      }

      // Not a known command - treat entire thing after @claude as a prompt
      const fullArgs = commandMatch[1] + (commandMatch[2] ? ' ' + commandMatch[2] : '');
      return {
        type: 'claude',
        command: 'ask', // Free-form prompt
        args: fullArgs.trim(),
        fullMatch: commandMatch[0],
        startIndex,
        endIndex: startIndex + commandMatch[0].length,
      };
    }

    // Second try: just @claude (will show error asking for prompt)
    const barePattern = new RegExp(`${escapedTrigger}$`, 'i');
    const bareMatch = line.match(barePattern);

    if (bareMatch) {
      const startIndex = bareMatch.index!;
      return {
        type: 'claude',
        command: 'ask',
        args: '',
        fullMatch: bareMatch[0],
        startIndex,
        endIndex: startIndex + bareMatch[0].length,
      };
    }

    return null;
  }

  /**
   * Parse @cc trigger
   * Format: @cc [prompt]
   */
  private parseCCTrigger(line: string): ParsedTrigger | null {
    const escapedTrigger = this.escapeRegex(this.ccTrigger);
    const pattern = new RegExp(`${escapedTrigger}\\s+(.+)$`, 'i');

    const match = line.match(pattern);
    if (!match) return null;

    const startIndex = match.index!;

    return {
      type: 'cc',
      command: '',
      args: match[1].trim(),
      fullMatch: match[0],
      startIndex,
      endIndex: startIndex + match[0].length,
    };
  }

  /**
   * Check if cursor is inside a trigger pattern
   */
  isCursorInTrigger(line: string, cursorPos: number): boolean {
    const trigger = this.parseLine(line);
    if (!trigger) return false;
    return cursorPos >= trigger.startIndex && cursorPos <= trigger.endIndex;
  }

  /**
   * Find all triggers in a document
   */
  findAllTriggers(text: string): ParsedTrigger[] {
    const lines = text.split('\n');
    const triggers: ParsedTrigger[] = [];
    let offset = 0;

    for (const line of lines) {
      const trigger = this.parseLine(line);
      if (trigger) {
        triggers.push({
          ...trigger,
          startIndex: offset + trigger.startIndex,
          endIndex: offset + trigger.endIndex,
        });
      }
      offset += line.length + 1; // +1 for newline
    }

    return triggers;
  }

  /**
   * Get command suggestions for autocomplete
   */
  getCommandSuggestions(partial: string): string[] {
    const lower = partial.toLowerCase();
    return INLINE_COMMANDS.filter((cmd) => cmd.startsWith(lower));
  }

  /**
   * Validate a trigger before execution
   */
  validateTrigger(trigger: ParsedTrigger): {
    valid: boolean;
    error?: string;
  } {
    if (trigger.type === 'claude') {
      if (!isInlineCommand(trigger.command)) {
        return {
          valid: false,
          error: `Unknown command: ${trigger.command}. Available: ${INLINE_COMMANDS.join(', ')}`,
        };
      }

      // Some commands require args
      if (trigger.command === 'translate' && !trigger.args) {
        return {
          valid: false,
          error: 'Translate command requires a target language',
        };
      }

      // 'ask' requires a prompt
      if (trigger.command === 'ask' && !trigger.args) {
        return {
          valid: false,
          error: '@claude requires a prompt (e.g., @claude what is this about?)',
        };
      }
    }

    if (trigger.type === 'cc') {
      if (!trigger.args) {
        return {
          valid: false,
          error: '@cc requires a prompt',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get help text for triggers
   */
  static getHelpText(): string {
    return `
## Inline Mode (@claude)
Quick completions that replace text inline:
- \`@claude summarize\` - Summarize selected/previous text
- \`@claude expand\` - Add more detail
- \`@claude rewrite\` - Improve clarity
- \`@claude explain\` - Simplify explanation
- \`@claude translate [language]\` - Translate text
- \`@claude fix\` - Fix grammar/spelling
- \`@claude bullets\` - Convert to bullet points
- \`@claude table\` - Convert to markdown table
- \`@claude continue\` - Continue writing

## Agentic Mode (@cc)
Full AI sessions with file access:
- \`@cc [any prompt]\` - Start agentic session

Press Tab to execute a trigger.
    `.trim();
  }
}
