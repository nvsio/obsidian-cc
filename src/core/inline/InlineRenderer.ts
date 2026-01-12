import type { ParsedTrigger, InlineCommand } from './TriggerParser';
import type { ClaudeAPI } from '../api/ClaudeAPI';
import { INLINE_PROMPTS } from '../api/ClaudeAPI';

/**
 * Inline renderer for @claude results
 *
 * Handles:
 * - Building prompts for each command type
 * - Streaming responses
 * - Formatting output for markdown
 */
export class InlineRenderer {
  private claudeApi: ClaudeAPI;

  constructor(claudeApi: ClaudeAPI) {
    this.claudeApi = claudeApi;
  }

  /**
   * Execute an inline trigger and return the result
   *
   * @param trigger - Parsed trigger from TriggerParser
   * @param context - Text context (selection or surrounding text)
   * @returns The AI-generated response
   */
  async execute(trigger: ParsedTrigger, context: string): Promise<string> {
    if (trigger.type !== 'claude') {
      throw new Error('InlineRenderer only handles @claude triggers');
    }

    const command = trigger.command as InlineCommand;
    const prompt = this.buildPrompt(command, context, trigger.args);

    try {
      const response = await this.claudeApi.complete(prompt, undefined, {
        maxTokens: this.getMaxTokensForCommand(command),
        temperature: this.getTemperatureForCommand(command),
      });

      return this.formatResponse(command, response);
    } catch (error) {
      throw new Error(
        `Failed to execute @claude ${command}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute with streaming for real-time updates
   *
   * @param trigger - Parsed trigger
   * @param context - Text context
   * @param onChunk - Callback for each streamed chunk
   * @returns Complete response
   */
  async executeStream(
    trigger: ParsedTrigger,
    context: string,
    onChunk: (text: string) => void
  ): Promise<string> {
    if (trigger.type !== 'claude') {
      throw new Error('InlineRenderer only handles @claude triggers');
    }

    const command = trigger.command as InlineCommand;
    const prompt = this.buildPrompt(command, context, trigger.args);

    let fullResponse = '';

    try {
      for await (const chunk of this.claudeApi.completeStream(prompt, undefined, {
        maxTokens: this.getMaxTokensForCommand(command),
        temperature: this.getTemperatureForCommand(command),
      })) {
        fullResponse += chunk;
        onChunk(chunk);
      }

      return this.formatResponse(command, fullResponse);
    } catch (error) {
      throw new Error(
        `Failed to execute @claude ${command}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build the appropriate prompt for each command
   */
  private buildPrompt(
    command: InlineCommand,
    context: string,
    args: string
  ): string {
    switch (command) {
      case 'summarize':
        return INLINE_PROMPTS.summarize(context);

      case 'expand':
        return INLINE_PROMPTS.expand(context);

      case 'rewrite':
        return INLINE_PROMPTS.rewrite(context);

      case 'explain':
        return INLINE_PROMPTS.explain(context);

      case 'translate':
        if (!args) {
          throw new Error('Translate requires a target language');
        }
        return INLINE_PROMPTS.translate(context, args);

      case 'fix':
        return INLINE_PROMPTS.fixGrammar(context);

      case 'bullets':
        return INLINE_PROMPTS.makeBullets(context);

      case 'table':
        return INLINE_PROMPTS.makeTable(context);

      case 'continue':
        return INLINE_PROMPTS.continue(context);

      case 'ask':
        // Free-form prompt
        if (!args) {
          throw new Error('@claude requires a prompt');
        }
        return INLINE_PROMPTS.custom(context, args);

      default:
        // Custom command - use args as instruction
        if (args) {
          return INLINE_PROMPTS.custom(context, args);
        }
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Get appropriate max tokens for each command
   */
  private getMaxTokensForCommand(command: InlineCommand): number {
    switch (command) {
      case 'summarize':
        return 512; // Summaries should be concise
      case 'fix':
        return 1024; // About same length as input
      case 'expand':
      case 'continue':
        return 2048; // These generate more content
      case 'bullets':
      case 'table':
        return 1024;
      default:
        return 1024;
    }
  }

  /**
   * Get appropriate temperature for each command
   */
  private getTemperatureForCommand(command: InlineCommand): number {
    switch (command) {
      case 'fix':
        return 0.1; // Grammar fixes should be precise
      case 'summarize':
      case 'explain':
        return 0.5; // Balance accuracy and readability
      case 'expand':
      case 'continue':
        return 0.8; // More creative for generation
      case 'rewrite':
        return 0.7; // Some creativity for style
      default:
        return 0.7;
    }
  }

  /**
   * Format the response based on command type
   */
  private formatResponse(command: InlineCommand, response: string): string {
    // Clean up response
    let formatted = response.trim();

    // Remove any leading/trailing quotes that Claude sometimes adds
    if (formatted.startsWith('"') && formatted.endsWith('"')) {
      formatted = formatted.slice(1, -1);
    }

    // Command-specific formatting
    switch (command) {
      case 'bullets':
        // Ensure proper bullet formatting
        if (!formatted.startsWith('-') && !formatted.startsWith('*')) {
          // Response might need bullet conversion
          formatted = formatted
            .split('\n')
            .map((line) => (line.trim() ? `- ${line.trim()}` : ''))
            .join('\n');
        }
        break;

      case 'table':
        // Ensure proper table formatting
        if (!formatted.includes('|')) {
          // Response might need table conversion
          // This is a fallback - Claude should return markdown tables
          console.warn('Table response missing markdown formatting');
        }
        break;

      default:
        break;
    }

    return formatted;
  }

  /**
   * Preview what a command will do (for UI hints)
   */
  getCommandDescription(command: InlineCommand): string {
    const descriptions: Record<InlineCommand, string> = {
      summarize: 'Create a concise summary of the text',
      expand: 'Add more detail and depth to the text',
      rewrite: 'Improve clarity, flow, and readability',
      explain: 'Explain the text in simpler terms',
      translate: 'Translate to another language',
      fix: 'Fix grammar and spelling errors',
      bullets: 'Convert to bullet point list',
      table: 'Convert to markdown table',
      continue: 'Continue writing from where text ends',
      ask: 'Ask Claude anything about the text',
    };

    return descriptions[command] || 'Execute custom command';
  }

  /**
   * Validate context for a command
   */
  validateContext(command: InlineCommand, context: string): {
    valid: boolean;
    warning?: string;
  } {
    // Check context length
    const tokens = this.claudeApi.estimateTokens(context);

    if (tokens < 5) {
      return {
        valid: false,
        warning: 'Please provide more context (select text or add content above)',
      };
    }

    if (tokens > 50000) {
      return {
        valid: true,
        warning: 'Context is very long - response may be truncated or slow',
      };
    }

    // Command-specific validation
    switch (command) {
      case 'table':
        if (!context.includes('\n') && context.split(',').length < 2) {
          return {
            valid: true,
            warning: 'Table works best with structured data (lists, CSV, etc.)',
          };
        }
        break;

      case 'translate':
        // Need target language
        break;
    }

    return { valid: true };
  }
}
