import * as vscode from 'vscode';
import { detectMicroPythonDevices, DetectedDevice } from './deviceDetection';

class TreeItem extends vscode.TreeItem {
    children: TreeItem[] | undefined;
}

export class PortListDataProvider implements vscode.TreeDataProvider<TreeItem> {
    portList: TreeItem[];

    constructor() {
        this.portList = [];
    }

    // Enable updates to tree view whenever items change (e.g. rescanning after plugging in a new microcontroller)
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined> = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined> = this._onDidChangeTreeData.event;

    // Always call refresh() immediately after creating an instance of PortListDataProvider to populate the list of available ports.
    async refresh() {
        try {
            const devices = await detectMicroPythonDevices(this.getWorkspaceRoot());
            console.debug('Detected MicroPython devices:', devices);
            this.portList = devices.map(device => {
                const item = new TreeItem(device.path);
                item.tooltip = this.buildTooltip(device);
                return item;
            });
            this.setHasDeviceContext(devices.length > 0);
        }
        catch (err) {
            console.error('Failed to refresh serial port list:', err);
            this.portList = [];
            this.setHasDeviceContext(false);
            vscode.window.showWarningMessage(`MicroPython device detection failed: ${err}`);
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(): vscode.ProviderResult<TreeItem[]> {
        return this.portList;
    }

    getPortNames(): string[] {
        return this.portList.map(port => port.label as string);
    }

    private buildTooltip(device: DetectedDevice): string {
        const parts = [
            `Port: ${device.path}`,
            device.manufacturer ? `Manufacturer: ${device.manufacturer}` : '',
            device.product ? `Product: ${device.product}` : '',
            device.serialNumber ? `Serial: ${device.serialNumber}` : ''
        ];
        return parts.filter(Boolean).join('\n');
    }

    private setHasDeviceContext(value: boolean): void {
        vscode.commands.executeCommand('setContext', 'mpremote:hasDevice', value);
    }

    private getWorkspaceRoot(): string | undefined {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }
}
