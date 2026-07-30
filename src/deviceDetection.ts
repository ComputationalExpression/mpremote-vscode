import * as vscode from 'vscode';
import { execMPRemote } from './executor';

export interface DetectedDevice {
    path: string;
    serialNumber?: string;
    pnpId?: string;
    manufacturer?: string;
    product?: string;
}

interface SerialPort {
    path: string;
    serialNumber?: string;
    pnpId?: string;
    manufacturer?: string;
    product?: string;
}

// Common USB-to-UART bridge identifiers that can host a MicroPython board.
const USB_UART_KEYWORDS = [
    /cp210/i,
    /ftdi/i,
    /ch34[01]/i,
    /qinheng/i,
    /usb-uart/i,
    /bridge/i,
    /serial/i,
    /arduino/i,
    /pico/i,
    /esp/i
];

// Identifiers that strongly suggest a MicroPython-capable board.
const MICROPYTHON_KEYWORDS = [
    /micropython/i,
    /raspberry\s*pi/i,
    /pico/i,
    /espressif/i,
    /esp32/i,
    /esp8266/i,
    /micro:bit/i,
    /stm32/i,
    /pyboard/i,
    /teensy/i,
    /tinyusb/i,
    /circuitpython/i
];

// Ports that are almost certainly not microcontrollers.
const SKIP_PATTERNS = [
    /^ttyS\d+$/i,           // Linux built-in serial ports
    /^tty\d+$/i,            // Linux virtual consoles
    /bluetooth/i,
    /modem/i,
    /rfcomm/i,
    /phone/i,
    /bthmodem/i,
    /serenum/i,
    /usbmodem.*?(?=\d+)/i   // macOS modem-manager-style ports are often not boards
];

/**
 * Return a list of candidate MicroPython serial ports.
 * First filters by skip-list and obvious metadata, then probes any remaining
 * USB-UART candidates unless probing is disabled.
 */
export async function detectMicroPythonDevices(cwd?: string): Promise<DetectedDevice[]> {
    const allPorts = await getSerialPortList(cwd);
    const skipList = readSkipList();
    const candidates = allPorts.filter(p => !shouldSkip(p.path, skipList));

    const known = candidates.filter(isLikelyMicroPython);
    const uncertain = candidates.filter(p => !isLikelyMicroPython(p) && isUsbUartCandidate(p));

    const probeEnabled = vscode.workspace.getConfiguration('mpremote').get<boolean>('detect.probe', true);
    if (!probeEnabled) {
        return [...known, ...uncertain];
    }

    const probeResults = await probeCandidates(uncertain, cwd);
    return [...known, ...probeResults];
}

/**
 * Parse the output of `mpremote devs` into a list of ports.
 * Output lines are typically tab- or space-separated, but the path can be
 * the only reliably present field.
 */
export async function getSerialPortList(cwd?: string): Promise<SerialPort[]> {
    const output = await execMPRemote(['devs'], { cwd, timeout: 10000 });
    const ports: SerialPort[] = [];
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
        const port = parseDevsLine(line);
        if (port) {
            ports.push(port);
        }
    }
    return ports;
}

/**
 * Parse a single line of `mpremote devs` output.
 * Exported for unit testing.
 */
export function parseDevsLine(line: string): SerialPort | undefined {
    const trimmed = line.trim();
    if (!trimmed) {
        return undefined;
    }
    // Split on whitespace, but keep the path as the first token.
    const tokens = trimmed.split(/\s+/);
    if (tokens.length === 0) {
        return undefined;
    }
    const path = tokens[0];
    if (!isPortPath(path)) {
        return undefined;
    }
    return {
        path: path,
        serialNumber: tokens[1] || '',
        pnpId: tokens[2] || '',
        manufacturer: tokens[3] || '',
        product: tokens.slice(4).join(' ') || ''
    };
}

function readSkipList(): string[] {
    const config = vscode.workspace.getConfiguration('mpremote');
    const raw = config.get<string>('serialPort.skip') || '';
    return raw.replace(/\s/g, '').split(',').filter(Boolean);
}

function shouldSkip(path: string, skipList: string[]): boolean {
    if (skipList.includes(path)) {
        return true;
    }
    for (const pattern of SKIP_PATTERNS) {
        if (pattern.test(path)) {
            return true;
        }
    }
    return false;
}

function isPortPath(token: string): boolean {
    return token.startsWith('/dev/') || /^COM\d+$/i.test(token);
}

export function isLikelyMicroPython(port: SerialPort): boolean {
    const haystack = `${port.manufacturer} ${port.product} ${port.pnpId} ${port.path}`.toLowerCase();
    for (const kw of MICROPYTHON_KEYWORDS) {
        if (kw.test(haystack)) {
            return true;
        }
    }
    return false;
}

export function isUsbUartCandidate(port: SerialPort): boolean {
    const haystack = `${port.manufacturer} ${port.product} ${port.pnpId} ${port.path}`.toLowerCase();
    for (const kw of USB_UART_KEYWORDS) {
        if (kw.test(haystack)) {
            return true;
        }
    }
    // If mpremote devs gives us no metadata, keep the port as a candidate
    // only if it looks like a USB serial port.
    if (port.path.startsWith('/dev/ttyUSB') || port.path.startsWith('/dev/ttyACM')) {
        return true;
    }
    if (port.path.startsWith('/dev/cu.')) {
        return true;
    }
    if (/^COM\d+$/.test(port.path)) {
        return true;
    }
    return false;
}

async function probeCandidates(candidates: SerialPort[], cwd?: string): Promise<DetectedDevice[]> {
    const timeout = vscode.workspace.getConfiguration('mpremote').get<number>('detect.probeTimeout', 1500);
    const limit = 3; // probe up to 3 ports concurrently
    const results: DetectedDevice[] = [];

    for (let i = 0; i < candidates.length; i += limit) {
        const batch = candidates.slice(i, i + limit);
        const batchResults = await Promise.all(
            batch.map(p => probePort(p, cwd, timeout))
        );
        for (const r of batchResults) {
            if (r) {
                results.push(r);
            }
        }
    }

    return results;
}

async function probePort(port: SerialPort, cwd: string | undefined, timeout: number): Promise<DetectedDevice | undefined> {
    try {
        const output = await execMPRemote(
            ['connect', port.path, 'exec', 'import sys; print(sys.implementation.name)'],
            { cwd, timeout }
        );
        const normalized = output.toLowerCase().replace(/\s/g, '');
        if (normalized.includes('micropython')) {
            return { ...port };
        }
    } catch {
        // Probing failed or timed out; this port is not a MicroPython device.
    }
    return undefined;
}
