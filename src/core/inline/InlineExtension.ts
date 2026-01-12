import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { TriggerParser, ParsedTrigger, isInlineCommand } from './TriggerParser';

/**
 * State effect for adding/removing loading indicators
 */
const setLoadingEffect = StateEffect.define<{
  from: number;
  to: number;
  loading: boolean;
}>();

/**
 * Widget for showing loading state
 */
class LoadingWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cc-inline-loading';
    span.textContent = ' ⏳';
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Widget for showing trigger hint
 */
class TriggerHintWidget extends WidgetType {
  constructor(private hint: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cc-inline-hint';
    span.textContent = this.hint;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Decoration for highlighting triggers
 */
const triggerMark = Decoration.mark({
  class: 'cc-inline-trigger',
});

const triggerMarkInvalid = Decoration.mark({
  class: 'cc-inline-trigger cc-inline-trigger-invalid',
});

/**
 * State field for tracking decorations
 */
const triggerDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);

    // Handle loading effects
    for (const effect of transaction.effects) {
      if (effect.is(setLoadingEffect)) {
        // Add or remove loading widget
        // (simplified - real impl would track state)
      }
    }

    return decorations;
  },
});

/**
 * Configuration for the inline extension
 */
export interface InlineExtensionConfig {
  claudeTrigger: string;
  ccTrigger: string;
  enabled: boolean;
  onClaudeTriggered: (trigger: ParsedTrigger, context: string) => Promise<string>;
  onCCTriggered: (trigger: ParsedTrigger, context: string) => void;
}

/**
 * Create the CodeMirror extension for inline triggers
 *
 * Features:
 * - Highlights @claude and @cc triggers
 * - Tab to execute triggers
 * - Shows loading state during API calls
 * - Replaces trigger with response (Notion-style)
 */
export function createInlineExtension(config: InlineExtensionConfig) {
  const parser = new TriggerParser(config.claudeTrigger, config.ccTrigger);

  // Store reference to current plugin instance for event handlers
  let pluginInstance: {
    handleTab: (view: EditorView) => Promise<boolean>;
  } | null = null;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private executing = false;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
        // Store reference to this instance
        pluginInstance = this;
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      /**
       * Build decorations for all visible triggers
       */
      buildDecorations(view: EditorView): DecorationSet {
        if (!config.enabled) {
          return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();

        for (const { from, to } of view.visibleRanges) {
          const text = view.state.sliceDoc(from, to);
          const lines = text.split('\n');
          let pos = from;

          for (const line of lines) {
            const trigger = parser.parseLine(line);

            if (trigger) {
              const triggerStart = pos + trigger.startIndex;
              const triggerEnd = pos + trigger.endIndex;

              // Validate trigger
              const validation = parser.validateTrigger(trigger);

              // Add highlight decoration
              if (validation.valid) {
                builder.add(triggerStart, triggerEnd, triggerMark);

                // Add hint widget after trigger
                const hint =
                  trigger.type === 'claude'
                    ? ' [⌘+Enter to execute]'
                    : ' [⌘+Enter to open session]';

                builder.add(
                  triggerEnd,
                  triggerEnd,
                  Decoration.widget({
                    widget: new TriggerHintWidget(hint),
                    side: 1,
                  })
                );
              } else {
                builder.add(triggerStart, triggerEnd, triggerMarkInvalid);

                // Show error hint
                builder.add(
                  triggerEnd,
                  triggerEnd,
                  Decoration.widget({
                    widget: new TriggerHintWidget(` ⚠️ ${validation.error}`),
                    side: 1,
                  })
                );
              }
            }

            pos += line.length + 1;
          }
        }

        return builder.finish();
      }

      /**
       * Handle Tab key to execute triggers
       */
      async handleTab(view: EditorView): Promise<boolean> {
        if (this.executing || !config.enabled) {
          return false;
        }

        // Get current line
        const { state } = view;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;

        // Check for trigger
        const trigger = parser.parseLine(lineText);
        if (!trigger) {
          return false;
        }

        // Validate
        const validation = parser.validateTrigger(trigger);
        if (!validation.valid) {
          return false;
        }

        // Get context (text before trigger, or selected text)
        const selection = state.selection.main;
        let context: string;

        if (selection.empty) {
          // Use text above the trigger line
          const textAbove = state.sliceDoc(0, line.from - 1);
          // Get last paragraph or ~500 chars
          const paragraphs = textAbove.split('\n\n');
          context = paragraphs[paragraphs.length - 1] || '';
          if (context.length > 2000) {
            context = context.slice(-2000);
          }
        } else {
          // Use selected text
          context = state.sliceDoc(selection.from, selection.to);
        }

        // Execute based on trigger type
        if (trigger.type === 'claude') {
          return this.executeClaudeTrigger(view, trigger, line, context);
        } else if (trigger.type === 'cc') {
          return this.executeCCTrigger(trigger, context);
        }

        return false;
      }

      /**
       * Execute @claude inline trigger
       */
      private async executeClaudeTrigger(
        view: EditorView,
        trigger: ParsedTrigger,
        line: { from: number; to: number; text: string },
        context: string
      ): Promise<boolean> {
        this.executing = true;

        try {
          // Show loading state
          const triggerStart = line.from + trigger.startIndex;
          const triggerEnd = line.from + trigger.endIndex;

          // Add loading widget
          view.dispatch({
            effects: setLoadingEffect.of({
              from: triggerEnd,
              to: triggerEnd,
              loading: true,
            }),
          });

          // Get response from Claude
          const response = await config.onClaudeTriggered(trigger, context);

          // Replace trigger with response
          view.dispatch({
            changes: {
              from: triggerStart,
              to: triggerEnd,
              insert: response,
            },
          });

          return true;
        } catch (error) {
          console.error('Inline trigger failed:', error);
          // Show error in editor
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          view.dispatch({
            changes: {
              from: line.from + trigger.startIndex,
              to: line.from + trigger.endIndex,
              insert: `[Error: ${errorMsg}]`,
            },
          });
          return true;
        } finally {
          this.executing = false;
        }
      }

      /**
       * Execute @cc agentic trigger
       */
      private executeCCTrigger(
        trigger: ParsedTrigger,
        context: string
      ): boolean {
        // Open sidebar/modal for agentic session
        config.onCCTriggered(trigger, context);
        return true;
      }
    },
    {
      decorations: (v) => v.decorations,

      eventHandlers: {
        keydown: (e, view) => {
          // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to execute
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
            // Use the stored plugin instance
            if (pluginInstance) {
              const { state } = view;
              const pos = state.selection.main.head;
              const line = state.doc.lineAt(pos);
              const trigger = parser.parseLine(line.text);

              if (trigger) {
                e.preventDefault();
                pluginInstance.handleTab(view);
                return true;
              }
            }
          }
          return false;
        },
      },
    }
  );
}

/**
 * CSS styles for inline extension
 * These should be added to styles/main.css
 */
export const INLINE_STYLES = `
/* Trigger highlighting */
.cc-inline-trigger {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: var(--font-monospace);
}

.cc-inline-trigger-invalid {
  background-color: var(--background-modifier-error);
  color: var(--text-error);
}

/* Hint widget */
.cc-inline-hint {
  color: var(--text-muted);
  font-size: 0.85em;
  font-style: italic;
  margin-left: 8px;
}

/* Loading indicator */
.cc-inline-loading {
  display: inline-block;
  animation: cc-pulse 1s infinite;
  margin-left: 4px;
}

@keyframes cc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Autocomplete dropdown (future) */
.cc-autocomplete {
  position: absolute;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.cc-autocomplete-item {
  padding: 4px 8px;
  cursor: pointer;
}

.cc-autocomplete-item:hover,
.cc-autocomplete-item.selected {
  background: var(--background-modifier-hover);
}
`;
