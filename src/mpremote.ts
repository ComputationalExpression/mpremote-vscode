import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { join as pathJoin } from 'path';
import { sendMPRemoteToTerminal } from './executor';
import { SYNC_IGNORE } from './utility';

export class MPRemote {
    terminal: vscode.Terminal;

    constructor() {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const existingTerminal = vscode.window.terminals.find(t => t.name === 'mpremote');
        if (existingTerminal) {
            console.debug('Reusing existing mpremote terminal.');
            this.terminal = existingTerminal;
        }
        else {
            console.debug('Creating new mpremote terminal.');
            this.terminal = vscode.window.createTerminal({ name: 'mpremote', cwd });
            this.terminal.show(false);  // false here lets the mpremote terminal take focus on startup
        }
    }

    private send(args: string[]): void {
        sendMPRemoteToTerminal(this.terminal, args).catch(err => {
            console.error('Failed to send mpremote command:', err);
            vscode.window.showErrorMessage(`mpremote command failed: ${err}`);
        });
    }

    cat(port: string, filePath: string) {
        if (port) {
            this.send(['connect', port, 'cat', filePath]);
        }
    }

    df(port: string) {
        if (port) {
            this.send(['connect', port, 'df']);
        }
    }

    download(port: string, remotePath: string, localPath: string) {
        if (port) {
            this.send(['connect', port, 'cp', ':' + remotePath, localPath]);
        }
    }

    exec(port: string, codeString: string) {
        if (port) {
            this.send(['connect', port, 'exec', codeString]);
        }
    }

    listDevs() {
        this.send(['devs']);
    }

    ls(port: string, dir: string) {
        if (port) {
            this.send(['connect', port, 'fs', 'ls', dir]);
        }
    }

    mipInstall(port: string, pkg: string) {
        if (port && pkg) {
            this.send(['connect', port, 'mip', 'install', pkg]);
        }
    }

    mkdir(port: string, dirPath: string) {
        if (port) {
            this.send(['connect', port, 'fs', 'mkdir', dirPath]);
        }
    }

    repl(port: string) {
        if (port) {
            this.send(['connect', port, 'repl']);
        }
    }

    reset(port: string) {
        if (port) {
            this.send(['connect', port, 'reset']);
        }
    }

    rm(port: string, filePath: string) {
        if (port && filePath) {
            this.send(['connect', port, 'fs', 'rm', ':' + filePath]);
        }
    }

    rmdir(port: string, dirPath: string) {
        if (port && dirPath) {
            this.send(['connect', port, 'fs', 'rmdir', ':' + dirPath]);
        }
    }

    run(port: string, filePath: string) {
        if (port && filePath) {
            this.send(['connect', port, 'run', filePath]);
        }
    }

    setrtc(port: string) {
        if (port) {
            this.send(['connect', port, 'rtc', '--set']);
        }
    }

    sync(port: string, localRoot: string) {
        if (port && localRoot) {
            console.debug("Sync it up, Kris! I'm about to.");
            fs.readdir(localRoot, { withFileTypes: true })
                .then(entries => {
                    for (const entry of entries) {
                        if (SYNC_IGNORE.includes(entry.name)) {
                            console.debug('Skipping directory:', entry.name);
                            continue;
                        }
                        const localPath = pathJoin(localRoot, entry.name);
                        if (entry.isDirectory()) {
                            console.debug('mpremote connect', port, 'fs cp -r', localPath, ':');
                            this.send(['connect', port, 'fs', 'cp', '-r', localPath, ':']);
                        }
                        else {
                            console.debug('mpremote connect', port, 'fs cp', localPath, ':');
                            this.send(['connect', port, 'fs', 'cp', localPath, ':']);
                        }
                    }
                })
                .catch(err => {
                    console.error(err);
                    vscode.window.showErrorMessage('Unable to read project directory for sync.');
                });
        }
    }

    upload(port: string, localPath: string, remotePath: string) {
        if (port && localPath && remotePath) {
            this.send(['connect', port, 'cp', localPath, ':' + remotePath]);
        }
    }

    version(port: string) {
        if (port) {
            this.send(['connect', port, 'exec', 'from sys import version; print(version)']);
        }
    }
}
