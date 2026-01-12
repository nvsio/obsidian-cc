/**
 * Safe command execution utility
 *
 * Uses execFile instead of exec to prevent shell injection attacks.
 * This is the preferred way to run external commands in this codebase.
 */

import { execFile, ExecFileOptions } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: 'success' | 'error';
  exitCode?: number;
  error?: Error;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

/**
 * Execute a command safely using execFile (no shell injection possible)
 *
 * @param command - The executable to run
 * @param args - Array of arguments (each arg is escaped automatically)
 * @param options - Execution options
 * @returns ExecResult with stdout, stderr, and status
 */
export async function execFileNoThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const execOptions: ExecFileOptions = {
    cwd: options.cwd,
    timeout: options.timeout || 30000,
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024, // 10MB
  };

  try {
    const { stdout, stderr } = await execFileAsync(command, args, execOptions);
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      status: 'success',
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as Error & {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      code?: number;
    };

    return {
      stdout: execError.stdout?.toString() || '',
      stderr: execError.stderr?.toString() || '',
      status: 'error',
      exitCode: execError.code,
      error: execError,
    };
  }
}

/**
 * Execute a command and throw on error
 *
 * @param command - The executable to run
 * @param args - Array of arguments
 * @param options - Execution options
 * @returns stdout string
 * @throws Error if command fails
 */
export async function execFileOrThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<string> {
  const result = await execFileNoThrow(command, args, options);

  if (result.status === 'error') {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n` +
        `Exit code: ${result.exitCode}\n` +
        `stderr: ${result.stderr}`
    );
  }

  return result.stdout;
}

/**
 * Check if a command exists by trying to run --version
 *
 * @param command - The command to check
 * @returns true if command exists and is executable
 */
export async function commandExists(command: string): Promise<boolean> {
  const result = await execFileNoThrow(command, ['--version'], {
    timeout: 5000,
  });
  return result.status === 'success';
}

/**
 * Find a command in common paths
 *
 * @param commandName - Name of the command to find
 * @param additionalPaths - Additional paths to check
 * @returns Path to command or null if not found
 */
export async function findCommand(
  commandName: string,
  additionalPaths: string[] = []
): Promise<string | null> {
  const commonPaths = [
    `/usr/local/bin/${commandName}`,
    `/opt/homebrew/bin/${commandName}`,
    `/usr/bin/${commandName}`,
    `${process.env.HOME}/.local/bin/${commandName}`,
    `${process.env.HOME}/.bun/bin/${commandName}`,
    ...additionalPaths,
  ];

  for (const path of commonPaths) {
    const result = await execFileNoThrow(path, ['--version'], {
      timeout: 5000,
    });
    if (result.status === 'success') {
      return path;
    }
  }

  // Try using 'which' on Unix-like systems
  const whichResult = await execFileNoThrow('which', [commandName], {
    timeout: 5000,
  });
  if (whichResult.status === 'success') {
    const foundPath = whichResult.stdout.trim();
    if (foundPath) {
      return foundPath;
    }
  }

  return null;
}
