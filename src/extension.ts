// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PortListDataProvider } from './serialportExplorer';
import { MPRemote } from './mpremote';
import { join, getRemoteDirEntries, getDevicePort, getLocalFilePath, getLocalRoot, STAT_MASK_DIR, STAT_MASK_FILE } from './utility';
import { join as pathJoin, basename as pathBasename } from 'path';

// Track the remote device's working directory for devices. Used by commands like cp, ls, and rm.
let remoteWorkingDir = new Map();
remoteWorkingDir.set('default', '/');

export async function activate(context: vscode.ExtensionContext) {
    let mpremote = new MPRemote();
    let serialPortDataProvider = new PortListDataProvider();
    await serialPortDataProvider.refresh();
    vscode.window.registerTreeDataProvider('serialPortView', serialPortDataProvider);

    /**
     * Helper to resolve a port from context args or the detected port list.
     * Errors are shown to the user and re-thrown so callers can abort cleanly.
     */
    async function resolvePort(args: any): Promise<string> {
        if (args !== undefined && args.label !== undefined) {  // context menu selection
            return args.label;
        }
        return getDevicePort(serialPortDataProvider.getPortNames());
    }

    /**
     * Wrapper that catches errors from commands and surfaces them.
     */
    function registerAsyncCommand(command: string, fn: (...args: any[]) => Promise<void>) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, async (...args) => {
                try {
                    await fn(...args);
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    if (message) {
                        vscode.window.showErrorMessage(message);
                    }
                }
            })
        );
    }

    /*
     *  Gather file names from the current remote working directory, present the choices
     *  via a selection list. Display the contents of the chosen file in the terminal
     *  window using MPRemote's cat command.
     */
    registerAsyncCommand('mpremote.cat', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        const dirEntries = await getRemoteDirEntries(port, cwd, STAT_MASK_FILE);
        let options = {
            title: `Choose a file to display from ${port}:${cwd}`,
            canSelectMany: false,
            matchOnDetail: true
        };
        const filename = await vscode.window.showQuickPick(dirEntries, options);
        console.debug('User selection:', filename);
        if (filename !== undefined) {  // undefined when user aborts or selection times out
            let filepath = join(cwd, filename);
            mpremote.cat(port, filepath);
        }
    });

    /*
     *  Change the remote parent path used for file operations like cp, ls, rm, etc.
     *  The parent path is stored per serial port in case there are multiple devices.
     */
    registerAsyncCommand('mpremote.chdir', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        console.debug('cwd:', cwd);
        const subdirs = await getRemoteDirEntries(port, cwd, STAT_MASK_DIR);
        if (cwd !== '/') {
            subdirs.unshift('..');
        }
        let options = {
            title: `Choose the working directory for ${port}:${cwd}`,
            canSelectMany: false,
            matchOnDetail: true
        };
        const choice = await vscode.window.showQuickPick(subdirs, options);
        console.debug('User selection:', choice);
        if (choice !== undefined) {  // undefined when user aborts or selection times out
            if (choice === '..') {
                remoteWorkingDir.set(port, cwd.substring(0, cwd.lastIndexOf('/')));
            }
            else {
                remoteWorkingDir.set(port, join(cwd, choice));
            }
            console.debug('New remote working directory:', remoteWorkingDir.get(port));
            mpremote.ls(port, remoteWorkingDir.get(port));
        }
    });

    /*
     *  Trigger a refresh of serial port list that appears in the explorer view.
     */
    registerAsyncCommand('mpremote.refreshSerialPorts', async () => {
        await serialPortDataProvider.refresh();
    });

    /*
     *  Run 'mpremote devs' to show detail about what's attached to the serial ports.
     */
    registerAsyncCommand('mpremote.devs', async () => {
        mpremote.listDevs();
    });

    /*
     * Download a file from the microcontroller using 'mpremote cp'.
     */
    registerAsyncCommand('mpremote.download', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        const dirEntries = await getRemoteDirEntries(port, cwd, STAT_MASK_FILE);
        const options = {
            title: `Choose file to download from ${port}:${cwd}`,
            canSelectMany: false,
            matchOnDetail: true
        };
        const choice = await vscode.window.showQuickPick(dirEntries, options);
        console.debug('User selection:', choice);
        if (choice !== undefined) {
            const dialogOptions = {
                title: 'Choose local destination',
                canSelectMany: false,
                openLabel: 'Select Folder',
                canSelectFiles: false,
                canSelectFolders: true
            };
            const fileUri = await vscode.window.showOpenDialog(dialogOptions);
            if (fileUri && fileUri[0]) {
                let localDir = fileUri[0].fsPath;
                let localPath = pathJoin(localDir, choice);
                let remotePath = join(cwd, choice);
                mpremote.download(port, remotePath, localPath);
            }
        }
    });

    /*
     *  Show the device's flash filesystem usage with 'mpremote df'.
     */
    registerAsyncCommand('mpremote.df', async (args) => {
        let port = await resolvePort(args);
        mpremote.df(port);
    });

    /*
     *  Run 'mpremote exec to run a python statement on the device.
     */
    registerAsyncCommand('mpremote.exec', async (args) => {
        let port = await resolvePort(args);
        let options = {
            title: `Python code to run on ${port}`
        };
        const codeString = await vscode.window.showInputBox(options);
        if (codeString) {
            mpremote.exec(port, codeString);
        }
    });

    /*
     *  Run 'mpremote ls' for the device detected from the right-click of the serial port list.
     */
    registerAsyncCommand('mpremote.ls', async (args) => {
        let port = await resolvePort(args);
        let dir = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        mpremote.ls(port, dir);
    });

    /*
     * Prompt for a package name and run 'mpremote mip install' to install it.
     */
    registerAsyncCommand('mpremote.mipInstall', async (args) => {
        let port = await resolvePort(args);
        let options = {
            title: "Enter a package name"
        };
        const pkg = await vscode.window.showInputBox(options);
        if (!pkg) {
            vscode.window.showErrorMessage('You must specify a package name. See: https://docs.micropython.org/en/latest/reference/packages.html#installing-packages-with-mipremote');
        }
        else {
            mpremote.mipInstall(port, pkg);
        }
    });

    /*
     *  Create a new directory under the current working directory on the device.
     */
    registerAsyncCommand('mpremote.mkdir', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        let options = {
            title: `Directory to create under ${port}:${cwd}`
        };
        const newdir = await vscode.window.showInputBox(options);
        if (newdir) {
            let dirpath = join(cwd, newdir);
            mpremote.mkdir(port, dirpath);
        }
    });

    /*
     *  Start a REPL prompt in the terminal window for the requested device.
     */
    registerAsyncCommand('mpremote.repl', async (args) => {
        let port = await resolvePort(args);
        mpremote.repl(port);
    });

    /*
     * Reset the device.
     */
    registerAsyncCommand('mpremote.reset', async (args) => {
        let port = await resolvePort(args);
        mpremote.reset(port);
    });

    /*
     * Prompt for a file to remove with respect to the device's current working dir.
     */
    registerAsyncCommand('mpremote.rm', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        const subdirs = await getRemoteDirEntries(port, cwd, STAT_MASK_FILE);
        let options = {
            title: `Choose file to remove from ${port}:${cwd}`,
            canSelectMany: false,
            matchOnDetail: true
        };
        const choice = await vscode.window.showQuickPick(subdirs, options);
        if (choice !== undefined) {  // undefined when user aborts or selection times out
            let doomedFile = join(cwd, choice);
            mpremote.rm(port, doomedFile);
        }
    });

    /*
     * Prompt for a directory to remove with respect to the device's current working dir.
     */
    registerAsyncCommand('mpremote.rmdir', async (args) => {
        let port = await resolvePort(args);
        let cwd = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
        const subdirs = await getRemoteDirEntries(port, cwd, STAT_MASK_DIR);
        if (subdirs.length === 0) {
            vscode.window.showInformationMessage(`No subdirectories to remove under ${cwd}`);
        }
        else {
            let options = {
                title: `Choose directory to remove from ${port}:${cwd}`,
                canSelectMany: false,
                matchOnDetail: true
            };
            const choice = await vscode.window.showQuickPick(subdirs, options);
            if (choice !== undefined) {  // undefined when user aborts or selection times out
                let doomedDirectory = join(cwd, choice);
                mpremote.rmdir(port, doomedDirectory);
            }
        }
    });

    /*
     *  Run a file from the local filesystem on the remote device.
     */
    registerAsyncCommand('mpremote.run', async (args) => {
        let localPath = getLocalFilePath(args);
        console.debug('Local file:', localPath);
        if (localPath) {
            let port = await getDevicePort(serialPortDataProvider.getPortNames());
            mpremote.run(port, localPath);
        }
    });

    /*
     *  Set the time and date on the device's realtime clock to match the host system.
     */
    registerAsyncCommand('mpremote.setrtc', async (args) => {
        let port = await resolvePort(args);
        mpremote.setrtc(port);
    });

    /*
     *  Recursively upload all files from the local project directory to the flash filesystem on the device.
     */
    registerAsyncCommand('mpremote.sync', async (args) => {
        let port = await resolvePort(args);
        let localRoot: string = getLocalRoot();
        if (!localRoot) {
            vscode.window.showErrorMessage('Unable to determine project root. Open a project folder in the Explorer first.');
        }
        else {
            const confirmation = await vscode.window.showInformationMessage(
                `Overwrite all files on ${port}:/ with local copies from ${localRoot}?`,
                "OK",
                "Cancel"
            );
            if (confirmation === "OK") {
                mpremote.sync(port, localRoot);
            }
        }
    });

    /*
     *  Upload a local file into the microcontroller's current working dir.
     */
    registerAsyncCommand('mpremote.upload', async (args) => {
        let localPath: string = getLocalFilePath(args);
        console.debug('Local file:', localPath);

        if (localPath) {
            let port = await getDevicePort(serialPortDataProvider.getPortNames());
            let localRoot: string = getLocalRoot();
            let cwd: string = remoteWorkingDir.get(port) || remoteWorkingDir.get('default');
            let remotePath: string = "";
            if (localRoot) {
                remotePath = pathJoin(cwd, localPath.replace(localRoot, "")).replace(/\\/g, "/");
            }
            else {
                remotePath = pathJoin(cwd, pathBasename(localPath)).replace(/\\/g, "/");
            }
            console.debug('Remote file:', remotePath);
            mpremote.upload(port, localPath, remotePath);
        }
    });

    /*
     *  Get the version number of the device's MicroPython firmware.
     */
    registerAsyncCommand('mpremote.version', async (args) => {
        let port = await resolvePort(args);
        mpremote.version(port);
    });
}


// This method is called when your extension is deactivated
export function deactivate() {}
