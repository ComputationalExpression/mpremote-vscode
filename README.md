# uv-mpremote-vscode

This plugin is a fork of [https://github.com/DavesCodeMusings/mpremote-vscode](https://github.com/DavesCodeMusings/mpremote-vscode). It has been modified to accommodate the `uv` package manager, to detect MicroPython devices reliably across platforms, and to enable the editor run button only when a compatible device is connected.

## Features

- Auto-detects the correct way to run `mpremote` on Windows, macOS, and Linux, including `uv run mpremote`.
- Probes serial ports to confirm that a connected device is running MicroPython.
- Shows detected devices in the **Serial Ports** explorer view.
- Only shows the **Run on MicroPython device** button in the editor toolbar when a device is connected.
- Cross-platform shell escaping for PowerShell, Command Prompt, and POSIX shells.

## Requirements

- [MicroPython](https://micropython.org) `mpremote` installed, or
- A Python environment with `mpremote` available as `python3 -m mpremote`, `python -m mpremote`, `py -m mpremote`, or `mpremote`, or
- A project managed with the [uv](https://docs.astral.sh/uv/) package manager.

## Extension Settings

| Setting | Description |
| --- | --- |
| `mpremote.command` | Override the command used to invoke `mpremote`. Use this if the auto-detection fails. |
| `mpremote.project.uv` | Enable `uv run mpremote` mode. |
| `mpremote.detect.probe` | Probe candidate serial ports to confirm they run MicroPython. Default: `true`. |
| `mpremote.detect.probeTimeout` | Milliseconds to wait for each port probe. Default: `1500`. |
| `mpremote.serialPort.skip` | Comma-separated list of ports to ignore (e.g., `COM1,COM2`). |
| `mpremote.srcSubdirectory` | Project subdirectory containing MicroPython files. |
| `mpremote.startupCheck.skip` | Skip the startup check for `mpremote`. |

## Detection

The extension detects devices in two stages:

1. **Fast path** — `mpremote devs` output is parsed and ports with known MicroPython or USB-UART identifiers are kept immediately.
2. **Probe** — remaining USB-UART candidates are probed with `mpremote connect <port> exec "import sys; print(sys.implementation.name)"`. Only ports that report `micropython` are shown.

Probing is concurrent and limited to three ports at a time. If you prefer the fast path only, set `mpremote.detect.probe` to `false`.

## Troubleshooting

### "No device detected" or run button missing

- Make sure the board is connected and shows up in `mpremote devs` in a terminal.
- On Linux, you may need to add your user to the `dialout` group or install the appropriate USB-UART driver.
- On Windows, install the driver for the USB-UART chip (CP210x, CH340, FTDI, etc.).
- Check `mpremote.serialPort.skip` if you are filtering out the correct port.
- Set `mpremote.command` to the full invocation that works on your machine, e.g., `python3 -m mpremote` or `py -m mpremote`.

### uv projects

Enable `mpremote.project.uv` and open the workspace at the project root (the directory containing `pyproject.toml` or `.python-version`). The extension will use `uv run mpremote`.

### Windows PowerShell vs Command Prompt

The extension detects the default VS Code terminal shell and escapes paths accordingly. If you change the default terminal profile, reload the window for the change to take effect.

## Known Limitations

- Detection relies on `mpremote devs` and the ability to open a serial port. If another program has the port open, probing will fail.
- Some USB-UART chips may not be identifiable from metadata alone; probing will still catch them if the device is running MicroPython.
