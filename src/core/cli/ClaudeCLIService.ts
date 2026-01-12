import { Notice, App } from 'obsidian';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Service to manage Claude CLI installation and launching
 */
export class ClaudeCLIService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Check if Claude CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const cmd = os.platform() === 'win32' ? 'where' : 'which';
      execFile(cmd, ['claude'], (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Install Claude CLI by opening terminal with install command
   */
  async install(): Promise<boolean> {
    const installCmd = 'npm install -g @anthropic-ai/claude-code';
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: Open Terminal with install command
      const script = `
        tell application "Terminal"
          activate
          do script "${installCmd}"
        end tell
      `;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      new Notice('Opening Terminal to install Claude CLI...');
    } else if (platform === 'win32') {
      // Windows
      spawn('cmd', ['/c', 'start', 'cmd', '/k', installCmd], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      new Notice('Opening terminal to install Claude CLI...');
    } else {
      // Linux: Try common terminals
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
      let launched = false;
      for (const term of terminals) {
        try {
          if (term === 'gnome-terminal') {
            spawn(term, ['--', 'bash', '-c', `${installCmd}; exec bash`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          } else {
            spawn(term, ['-e', `bash -c "${installCmd}; exec bash"`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
          launched = true;
          new Notice('Opening terminal to install Claude CLI...');
          break;
        } catch {
          continue;
        }
      }
      if (!launched) {
        new Notice('Could not open terminal. Run: npm install -g @anthropic-ai/claude-code');
        return false;
      }
    }

    // Return true - user will complete install in terminal
    return true;
  }

  /**
   * Launch Claude CLI in terminal with note content as initial prompt
   */
  async launch(noteContent: string, notePath: string): Promise<void> {
    const isInstalled = await this.isInstalled();

    if (!isInstalled) {
      new Notice('Claude CLI not found. Installing...');
      const installed = await this.install();
      if (!installed) {
        new Notice('Please install manually: npm install -g @anthropic-ai/claude-code');
        return;
      }
    }

    // Write note content to a temp file
    const tempDir = os.tmpdir();
    const contextFile = path.join(tempDir, 'obsidian-cc-context.md');

    try {
      fs.writeFileSync(contextFile, noteContent, 'utf-8');
    } catch (error) {
      new Notice('Failed to write context file');
      return;
    }

    // Copy note to clipboard for easy pasting
    try {
      await navigator.clipboard.writeText(noteContent);
    } catch {
      // Clipboard might not be available
    }

    // Get vault path for working directory
    const vaultPath = (this.app.vault.adapter as any).basePath || os.homedir();

    // Build the initial prompt - tell Claude about the note
    const initialPrompt = `I'm working with this note from Obsidian (${notePath}):\\n\\nPlease read the context file at: ${contextFile}`;

    // Launch terminal with claude command
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: Use AppleScript to open Terminal with claude and initial prompt
      // Escape for AppleScript string
      const escapedPrompt = initialPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `
        tell application "Terminal"
          activate
          do script "cd '${vaultPath.replace(/'/g, "'\\''")}' && claude -p \\"${escapedPrompt}\\""
        end tell
      `;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      new Notice('Claude CLI launched with note context');
    } else if (platform === 'win32') {
      // Windows
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${vaultPath}" && claude -p "${initialPrompt}"`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      new Notice('Claude CLI launched with note context');
    } else {
      // Linux: Try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
      let launched = false;

      for (const term of terminals) {
        try {
          if (term === 'gnome-terminal') {
            spawn(term, ['--', 'bash', '-c', `cd '${vaultPath}' && claude -p "${initialPrompt}"; exec bash`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          } else {
            spawn(term, ['-e', `bash -c "cd '${vaultPath}' && claude -p \\"${initialPrompt}\\"; exec bash"`], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
          launched = true;
          new Notice('Claude CLI launched with note context');
          break;
        } catch {
          continue;
        }
      }

      if (!launched) {
        new Notice('Could not open terminal. Note copied to clipboard. Run: claude');
      }
    }
  }
}
