import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolveMPRemoteCommand, MPRemoteCommand } from './mpremoteCommand';
import { escapeShellArg, ShellFamily, detectShellFamily } from './shell';

const execFileAsync = promisify(execFile);

export interface ExecOptions {
    cwd?: string;
    timeout?: number;
}

/**
 * Run mpremote with the given arguments and capture stdout.
 * This avoids shell parsing issues by using execFile with an argument array.
 */
export async function execMPRemote(args: string[], options?: ExecOptions): Promise<string> {
    const inv = await resolveMPRemoteCommand(options?.cwd);
    const result = await execFileAsync(inv.cmd, [...inv.args, ...args], {
        cwd: options?.cwd,
        timeout: options?.timeout ?? 15000,
        windowsHide: true
    });
    return result.stdout;
}

/**
 * Build a safely-escaped shell command string for the current terminal.
 */
export function buildTerminalCommand(base: MPRemoteCommand, args: string[], family?: ShellFamily): string {
    family = family ?? detectShellFamily();
    const parts = [
        escapeShellArg(base.cmd, family),
        ...base.args.map(a => escapeShellArg(a, family)),
        ...args.map(a => escapeShellArg(a, family))
    ];
    return parts.join(' ');
}

/**
 * Send an mpremote command to a VS Code terminal using shell-safe escaping.
 */
export async function sendMPRemoteToTerminal(
    terminal: vscode.Terminal,
    args: string[],
    family?: ShellFamily
): Promise<void> {
    const inv = await resolveMPRemoteCommand();
    terminal.sendText(buildTerminalCommand(inv, args, family));
}
