import Anthropic from '@anthropic-ai/sdk';
import type { KeychainService } from '../security/KeychainService';

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Message structure for conversations
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Parameters for creating a message
 */
export interface CreateMessageParams {
  prompt: string;
  systemPrompt?: string;
  messages?: Message[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Streaming chunk from Claude API
 */
export interface StreamChunk {
  type: 'text' | 'start' | 'stop' | 'error';
  text?: string;
  error?: string;
}

/**
 * Response from non-streaming message
 */
export interface MessageResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

/**
 * Claude API wrapper for direct Anthropic API calls
 *
 * Used by:
 * - @claude inline mode (quick, focused responses)
 * - Quick Ask command
 *
 * Features:
 * - Streaming support for real-time responses
 * - Automatic API key retrieval from keychain
 * - Error handling with retries
 * - Token counting
 */
export class ClaudeAPI {
  private keychainService: KeychainService;
  private client: Anthropic | null = null;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(
    keychainService: KeychainService,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ) {
    this.keychainService = keychainService;
    this.defaultModel = options.model || 'claude-sonnet-4-20250514';
    this.defaultMaxTokens = options.maxTokens || 4096;
    this.defaultTemperature = options.temperature || 0.7;
  }

  /**
   * Initialize the Anthropic client with API key from keychain
   */
  private async getClient(): Promise<Anthropic> {
    if (this.client) {
      return this.client;
    }

    const apiKey = await this.keychainService.getApiKey();
    if (!apiKey) {
      throw new Error(
        'No API key configured. Please add your Anthropic API key in settings.'
      );
    }

    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true, // Required for Obsidian (Electron)
    });

    return this.client;
  }

  /**
   * Reset client (call when API key changes)
   */
  resetClient(): void {
    this.client = null;
  }

  /**
   * Create a streaming message
   * Yields text chunks as they arrive
   */
  async *createMessageStream(
    params: CreateMessageParams
  ): AsyncGenerator<StreamChunk> {
    const client = await this.getClient();

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
      params.messages?.map((m) => ({ role: m.role, content: m.content })) || [];

    // Add the current prompt
    messages.push({ role: 'user', content: params.prompt });

    try {
      yield { type: 'start' };

      const stream = await client.messages.stream({
        model: params.model || this.defaultModel,
        max_tokens: params.maxTokens || this.defaultMaxTokens,
        temperature: params.temperature ?? this.defaultTemperature,
        system: params.systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text', text: event.delta.text };
        }
      }

      yield { type: 'stop' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      yield { type: 'error', error: message };
      throw error;
    }
  }

  /**
   * Create a non-streaming message
   * Returns complete response
   */
  async createMessage(params: CreateMessageParams): Promise<MessageResponse> {
    const client = await this.getClient();

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
      params.messages?.map((m) => ({ role: m.role, content: m.content })) || [];

    messages.push({ role: 'user', content: params.prompt });

    const response = await client.messages.create({
      model: params.model || this.defaultModel,
      max_tokens: params.maxTokens || this.defaultMaxTokens,
      temperature: params.temperature ?? this.defaultTemperature,
      system: params.systemPrompt,
      messages,
    });

    // Extract text content
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason || 'unknown',
    };
  }

  /**
   * Simple completion for inline mode
   * Optimized for quick, focused responses
   */
  async complete(
    prompt: string,
    context?: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    const systemPrompt = context
      ? `You are a helpful AI assistant integrated into Obsidian. Respond concisely and directly. Context from the user's note:\n\n${context}`
      : 'You are a helpful AI assistant integrated into Obsidian. Respond concisely and directly.';

    const response = await this.createMessage({
      prompt,
      systemPrompt,
      maxTokens: options?.maxTokens || 1024, // Shorter for inline
      temperature: options?.temperature ?? 0.7,
    });

    return response.content;
  }

  /**
   * Stream completion for inline mode with real-time updates
   */
  async *completeStream(
    prompt: string,
    context?: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): AsyncGenerator<string> {
    const systemPrompt = context
      ? `You are a helpful AI assistant integrated into Obsidian. Respond concisely and directly. Context from the user's note:\n\n${context}`
      : 'You are a helpful AI assistant integrated into Obsidian. Respond concisely and directly.';

    for await (const chunk of this.createMessageStream({
      prompt,
      systemPrompt,
      maxTokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.7,
    })) {
      if (chunk.type === 'text' && chunk.text) {
        yield chunk.text;
      } else if (chunk.type === 'error') {
        throw new Error(chunk.error);
      }
    }
  }

  /**
   * Estimate token count for a string
   * Uses rough approximation (more accurate would require tokenizer)
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    // This is an approximation; actual tokenization may vary
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if API is configured and working
   */
  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getClient();
      // Try a minimal request
      await this.createMessage({
        prompt: 'Say "ok"',
        maxTokens: 10,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update default settings
   */
  updateDefaults(options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): void {
    if (options.model) this.defaultModel = options.model;
    if (options.maxTokens) this.defaultMaxTokens = options.maxTokens;
    if (options.temperature !== undefined)
      this.defaultTemperature = options.temperature;
  }
}

/**
 * Predefined prompts for common inline operations
 */
export const INLINE_PROMPTS = {
  summarize: (text: string) =>
    `Summarize the following text concisely:\n\n${text}`,

  expand: (text: string) =>
    `Expand on the following text with more detail:\n\n${text}`,

  rewrite: (text: string) =>
    `Rewrite the following text to improve clarity and flow:\n\n${text}`,

  explain: (text: string) =>
    `Explain the following text in simple terms:\n\n${text}`,

  translate: (text: string, language: string) =>
    `Translate the following text to ${language}:\n\n${text}`,

  fixGrammar: (text: string) =>
    `Fix any grammar and spelling errors in the following text. Only return the corrected text:\n\n${text}`,

  makeBullets: (text: string) =>
    `Convert the following text into a bullet point list:\n\n${text}`,

  makeTable: (text: string) =>
    `Convert the following information into a markdown table:\n\n${text}`,

  continue: (text: string) =>
    `Continue writing from where this text ends:\n\n${text}`,

  custom: (text: string, instruction: string) =>
    `${instruction}\n\nText:\n${text}`,
} as const;
