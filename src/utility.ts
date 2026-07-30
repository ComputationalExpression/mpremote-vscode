import * as vscode from 'vscode';
import { join as pathJoin } from 'path';
import { execMPRemote } from './executor';

export const STAT_MASK_DIR = 0x4000;
export const STAT_MASK_FILE = 0x8000;
export const STAT_MASK_ALL = 0xFFFF;

export const SYNC_IGNORE = [
    '.git',  // when using git source control
    '__pycache__'  // when code is run in VS Code Python
];

/**
 * Join file path components using forward slash separator. Because the Windows
 * version of path.join() will try to use a backslash.
 */
export function join(...args: string[]) {
    let path = '';
    for (let i = 0; i < args.length; i++) {
        if (path.endsWith('/') || args[i].startsWith('/')) {
            path += args[i];
        }
        else {
            path += '/' + args[i];
        }
    }
    return path;
}

/**
 * Return a JSON formatted list of entries in remote (device) directory. Can be
 * limited to just directories (STAT_MASK_DIR) or just files (STAT_MASK_FILES).
 */
export async function getRemoteDirEntries(port: string, dir: string, mask = STAT_MASK_ALL): Promise<string[]> {
    const escapedDir = dir.replace(/'/g, "\\'");
    const oneLiner = `from os import listdir, stat ; print([entry for entry in listdir('${escapedDir}') if stat('${escapedDir}' + '/' + entry)[0] & ${mask} != 0])`;
    console.debug('Gathering directory entries for', dir, 'on device at', port);
    const output = await execMPRemote(['connect', port, 'exec', oneLiner], { timeout: 15000 });
    console.debug('Files found:\n', output);
    try {
        const dirEntries = JSON.parse(output.replace(/'/g, '"'));  // Python uses single quote, JSON parser expects double quote.
        return dirEntries;
    }
    catch (ex) {
        console.error('Parsing Python listdir() output failed.', ex);
        throw new Error('Parsing directory entries failed.');
    }
}

/**
 * Determine the serial port used to communicate with the microcontroller. If
 * multiple ports are found, prompt the user to select one of them.
 */
export async function getDevicePort(portList: string[]): Promise<string> {
    let options = {
        title: 'Select device',
        canSelectMany: false,
        matchOnDetail: true
    };
    if (portList.length === 0) {
        console.debug('No device found on any port.');
        throw new Error('No device detected.');
    }
    else if (portList.length === 1) {
        console.debug('Using device on port:', portList[0]);
        return portList[0];
    }
    else {
        const choice = await vscode.window.showQuickPick(portList, options);
        if (choice === undefined) {
            throw new Error('No device selected.');
        }
        console.debug('Using device on port:', choice);
        return choice;
    }
}

/**
 *  Try to determine the local file path in one of two ways. First, by args
 *  passed if there was a right-click selection in the file explorer or an
 *  editor window. Second, by the properties of the active editor window if
 *  the command palette was used. Finally, return empty string if both of
 *  these methods fail.
 */
export function getLocalFilePath(args: any) {
    let localPath = '';
    if (args !== undefined && args.fsPath !== undefined) {  // user right-clicked upload on a file or editor window
        localPath = args.fsPath;
        console.debug('File path determined from context.', localPath);
    }
    else if (vscode.window.activeTextEditor) {
        localPath = vscode.window.activeTextEditor.document.fileName;
        console.debug('No context given. Defaulting to active editor window path.', localPath);
        if (vscode.window.activeTextEditor.document.isUntitled || vscode.window.activeTextEditor.document.isDirty) {
            vscode.window.showWarningMessage('Unsaved changes exist. Results may be inconsistent.');
        }
    }
    else {
        vscode.window.showErrorMessage('Cannot determine file path. Open file in active editor window first.');
    }
    return localPath;
}

/**
 *  Try to determine the project files root directory using the currently
 *  open folder in VS Code's Explorer. If there is no open folder, return
 *  an empty string.
 */
export function getLocalRoot() {
    let localRoot: string = "";
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
        localRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    if (vscode.workspace.getConfiguration('mpremote').srcSubdirectory) {
        console.debug("Appending srcSubdirectory:", vscode.workspace.getConfiguration('mpremote').srcSubdirectory);
        localRoot = pathJoin(localRoot, vscode.workspace.getConfiguration('mpremote').srcSubdirectory);
    }
    return localRoot;
}
