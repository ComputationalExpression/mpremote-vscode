import * as vscode from 'vscode';

export type ShellFamily = 'posix' | 'powershell' | 'cmd';

/**
 * Detect whether the current VS Code terminal environment behaves like POSIX,
 * PowerShell, or cmd.exe. This is a best-effort guess for Windows.
 */
export function detectShellFamily(): ShellFamily {
    if (process.platform !== 'win32') {
        return 'posix';
    }

    const defaultProfile = vscode.workspace
        .getConfiguration('terminal.integrated.defaultProfile')
        .get<string>('windows');
    if (defaultProfile) {
        const p = defaultProfile.toLowerCase();
        if (p.includes('powershell') || p.includes('pwsh')) {
            return 'powershell';
        }
        if (p.includes('command') || p.includes('cmd')) {
            return 'cmd';
        }
    }

    const comspec = (process.env.ComSpec || '').toLowerCase();
    if (comspec.includes('cmd.exe')) {
        return 'cmd';
    }

    return 'powershell';
}

/**
 * Escape a single argument for the given shell family.
 * The default shell family is detected from the environment.
 */
export function escapeShellArg(arg: string, family?: ShellFamily): string {
    family = family ?? detectShellFamily();

    switch (family) {
        case 'cmd':
            return escapeCmdArg(arg);
        case 'powershell':
            return escapePowerShellArg(arg);
        case 'posix':
        default:
            return escapePosixArg(arg);
    }
}

function escapePosixArg(arg: string): string {
    if (!/[^%+,-.\/0-9:@A-Z_a-z]/.test(arg)) {
        return arg;
    }
    return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

function escapePowerShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "''")}'`;
}

function escapeCmdArg(arg: string): string {
    if (!/[\s\&\|\^\<\>\(\)\@\!"]/.test(arg)) {
        return arg;
    }
    // cmd.exe treats double quotes specially. Prefix every backslash that
    // immediately precedes a quote with another backslash, then double the
    // trailing backslashes.
    let escaped = arg.replace(/(\\*)"/g, '$1$1\\"');
    escaped = escaped.replace(/(\\+)$/, '$1$1');
    return `"${escaped}"`;
}
