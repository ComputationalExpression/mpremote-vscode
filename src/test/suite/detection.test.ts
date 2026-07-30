import * as assert from 'assert';
import { parseDevsLine, isLikelyMicroPython, isUsbUartCandidate } from '../../deviceDetection';

suite('Device Detection Test Suite', () => {
    test('parseDevsLine parses Linux output', () => {
        const port = parseDevsLine('/dev/ttyUSB0 12345 some-pnp Silicon_Labs CP210x_USB_to_UART_Bridge');
        assert.ok(port);
        assert.strictEqual(port?.path, '/dev/ttyUSB0');
        assert.strictEqual(port?.serialNumber, '12345');
        assert.strictEqual(port?.manufacturer, 'Silicon_Labs');
        assert.strictEqual(port?.product, 'CP210x_USB_to_UART_Bridge');
    });

    test('parseDevsLine parses Windows output', () => {
        const port = parseDevsLine('COM3 0001 USB\\VID_2341&PID_0057 MicroPython Board_in_FS_mode');
        assert.ok(port);
        assert.strictEqual(port?.path, 'COM3');
        assert.strictEqual(port?.manufacturer, 'MicroPython');
        assert.strictEqual(port?.product, 'Board_in_FS_mode');
    });

    test('parseDevsLine parses macOS output', () => {
        const port = parseDevsLine('/dev/cu.usbserial-0001');
        assert.ok(port);
        assert.strictEqual(port?.path, '/dev/cu.usbserial-0001');
    });

    test('parseDevsLine ignores empty and header lines', () => {
        assert.strictEqual(parseDevsLine(''), undefined);
        assert.strictEqual(parseDevsLine('   '), undefined);
        assert.strictEqual(parseDevsLine('Use "mpremote connect <port>" to connect to a device'), undefined);
    });

    test('isLikelyMicroPython recognizes MicroPython metadata', () => {
        assert.strictEqual(
            isLikelyMicroPython({ path: 'COM3', manufacturer: 'MicroPython', product: 'Board in FS mode' }),
            true
        );
        assert.strictEqual(
            isLikelyMicroPython({ path: '/dev/ttyACM0', manufacturer: 'Raspberry Pi', product: 'Pico' }),
            true
        );
    });

    test('isLikelyMicroPython ignores plain serial bridges', () => {
        assert.strictEqual(
            isLikelyMicroPython({ path: '/dev/ttyUSB0', manufacturer: 'Silicon Labs', product: 'CP210x' }),
            false
        );
    });

    test('isUsbUartCandidate recognizes possible USB-UART ports', () => {
        assert.strictEqual(isUsbUartCandidate({ path: '/dev/ttyUSB0' }), true);
        assert.strictEqual(isUsbUartCandidate({ path: '/dev/ttyACM0' }), true);
        assert.strictEqual(isUsbUartCandidate({ path: '/dev/cu.usbserial-0001' }), true);
        assert.strictEqual(isUsbUartCandidate({ path: 'COM5' }), true);
        assert.strictEqual(isUsbUartCandidate({ path: '/dev/ttyS0' }), false);
    });
});
