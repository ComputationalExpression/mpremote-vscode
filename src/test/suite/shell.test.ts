import * as assert from 'assert';
import { escapeShellArg } from '../../shell';

suite('Shell Escaping Test Suite', () => {
    test('escapes POSIX arguments with spaces and quotes', () => {
        assert.strictEqual(escapeShellArg('hello world', 'posix'), '"hello world"');
        assert.strictEqual(escapeShellArg(`it's`, 'posix'), `"it's"`);
    });

    test('escapes PowerShell arguments with apostrophes', () => {
        assert.strictEqual(escapeShellArg('hello world', 'powershell'), "'hello world'");
        assert.strictEqual(escapeShellArg(`it's`, 'powershell'), "'it''s'");
    });

    test('escapes cmd arguments with spaces', () => {
        assert.strictEqual(escapeShellArg('hello world', 'cmd'), '"hello world"');
        assert.strictEqual(escapeShellArg('C:\\\\path with spaces\\\\file.py', 'cmd'), '"C:\\\\path with spaces\\\\file.py"');
    });

    test('leaves simple arguments unchanged', () => {
        assert.strictEqual(escapeShellArg('file.py', 'posix'), 'file.py');
        assert.strictEqual(escapeShellArg('file.py', 'powershell'), "'file.py'");
        assert.strictEqual(escapeShellArg('file.py', 'cmd'), 'file.py');
    });
});
