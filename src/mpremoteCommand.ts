import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface MPRemoteCommand {
    cmd: string;
    args: string[];
}

let cachedCommand: MPRemoteCommand | undefined;

/**
 * Resolve the mpremote invocation for this session.
 * The result is cached after the first successful lookup.
 */
export async function resolveMPRemoteCommand(cwd?: string): Promise<MPRemoteCommand> {
    if (cachedCommand) {
        if (await invocationWorks(cachedCommand, cwd)) {
            return cachedCommand;
        }
        cachedCommand = undefined;
    }

    const config = vscode.workspace.getConfiguration('mpremote');
    const configured = config.get<string>('command')?.trim();
    if (configured) {
        const inv = parseCommand(configured);
        if (await invocationWorks(inv, cwd)) {
            cachedCommand = inv;
            return inv;
        }
        throw new Error(`Configured mpremote command '${configured}' does not work. Check the mpremote.command setting.`);
    }

    if (config.get<boolean>('project.uv')) {
        const uvInv: MPRemoteCommand = { cmd: 'uv', args: ['run', 'mpremote'] };
        if (await invocationWorks(uvInv, cwd)) {
            cachedCommand = uvInv;
            return uvInv;
        }
    }

    const candidates = getPlatformCandidates();
    for (const inv of candidates) {
        if (await invocationWorks(inv, cwd)) {
            cachedCommand = inv;
            return inv;
        }
    }

    throw new Error(
        'Could not find a working mpremote command. Install mpremote or set mpremote.command.'
    );
}

/**
 * Clear the cached command. Useful when the user changes settings.
 */
export function clearMPRemoteCommandCache(): void {
    cachedCommand = undefined;
}

function getPlatformCandidates(): MPRemoteCommand[] {
    switch (process.platform) {
        case 'win32':
            return [
                { cmd: 'mpremote', args: [] },
                { cmd: 'py', args: ['-m', 'mpremote'] },
                { cmd: 'py.exe', args: ['-m', 'mpremote'] },
                { cmd: 'python', args: ['-m', 'mpremote'] },
                { cmd: 'python3', args: ['-m', 'mpremote'] }
            ];
        case 'darwin':
        case 'linux':
        default:
            return [
                { cmd: 'mpremote', args: [] },
                { cmd: 'python3', args: ['-m', 'mpremote'] },
                { cmd: 'python', args: ['-m', 'mpremote'] }
            ];
    }
}

function parseCommand(configured: string): MPRemoteCommand {
    const parts = configured.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        throw new Error('mpremote.command setting is empty.');
    }
    return { cmd: parts[0], args: parts.slice(1) };
}

async function invocationWorks(inv: MPRemoteCommand, cwd?: string): Promise<boolean> {
    try {
        const result = await execFileAsync(inv.cmd, [...inv.args, '--version'], {
            cwd,
            timeout: 5000,
            windowsHide: true
        });
        const output = (result.stdout + result.stderr).toLowerCase();
        return output.includes('mpremote');
    } catch {
        return false;
    }
}
