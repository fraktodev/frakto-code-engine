<div align="center">
  <a href="https://frakto.dev/">
    <img src="https://frakto.dev/dist/img/logos/frakto-iso.png" alt="Frakto logo" width="150" height="173">
  </a>
  <br>
  <strong>Frakto Code Engine</strong>
  <p><em>Fragment. Optimize. Reconstruct.</em></p>
  <img src="https://img.shields.io/badge/version-0.1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/VSCode-%5E1.90.0-blue.svg" alt="VS Code">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License">
  <img src="https://img.shields.io/badge/Prs-welcome-brightgreen.svg" alt="Contributions welcome">
</div>

---

# Frakto Code Engine

Frakto Code Engine is the missing link between your tools and your editor.

A universal formatter & linter runner for Visual Studio Code that imposes nothing and enables everything. It pipes your editor’s content through any external process — formatter, linter, or custom script — and applies the output instantly, right back into the file.

Run Prettier, ESLint, your own shell magic — even all at once.

No restrictions. No hardcoded integrations. No opinions.
Just you, your stack, and full control over how your code gets cleaned, checked, and styled.

It’s the kind of tool power users dream of:
Modular. Powerful. Unopinionated.

## Table of Contents

- [Installation](#installation)
- [Configuration of external script](#configuration-of-external-script)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Open **Visual Studio Code**.
2. Go to the **Extensions** panel (or press `Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **Frakto Code Engine**.
4. Click **Install**.

Once installed, the extension will automatically activate for supported languages when editing files.

## Configuration of external script

**Frakto Code Engine** does not include any built-in formatter or linter. Instead, it acts as a secure bridge between VS Code and an external script defined by you.

### 1. Connect your external tool

Set the path to your custom script in the VS Code settings:

```json
"frakto.execFile": "/path/to/your/script/index.js"
```

Your script can be written in any language and must accept JSON input via `stdin`, returning a valid JSON response via `stdout`.

### 2. Payload sent to your script

Frakto will send the following structured object:

```ts
interface RequestPayload {
  mode: 'format' | 'lint' | 'both';
  trigger: 'onStart' | 'onOpen' | 'onChange' | 'onRunDiagnostic' | 'onFormat';
  language: string;
  content: string;
  linterStandard: string | null;
  fileName: string;
  filePath: string;
  fileEncoding: string;
  fileIsUntitled: boolean;
  fileIsDirty: boolean;
  workspacePath?: string;
  maxBuffer: number;
  vscodeVersion: string;
  timestamp: number;
}
```

This payload is sent as a **stringified JSON** via the following environment variable:

```ts
env: {
  ...process.env,
  FRAKTO_PAYLOAD: JSON.stringify(payload)
}
```

### 3. Expected response format

Your script must return a valid JSON with this structure:

```ts
interface ResponsePayload {
  formatted: string | null;
  diagnostics: DiagnosticPayload[] | null;
  debug?: any;
}
interface DiagnosticPayload {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  type: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  source: string;
  code: string;
}
```

> If the returned object does **not** match this structure, Frakto will throw an error and ignore the result.

This architecture allows you to create your own powerful code engine, with full control over formatting, linting, and diagnostics—without touching the extension code.

### 4. Example External Script

Here's a basic example in Node.js:

```js
#!/usr/bin/env node

const payload = JSON.parse(process.env.FRAKTO_PAYLOAD || '{}');

const result = {
  formatted: payload.content.toUpperCase(),
  diagnostics: null,
  debug: { note: 'Transformed to uppercase' }
};

process.stdout.write(JSON.stringify(result));
```

For a complete example of an external script implementation, you can check out or use [frakto-coding-standards](https://github.com/fraktodev/frakto-coding-standards), the official companion tool designed to work seamlessly with this extension.

## Usage

Once the external script is properly configured, VS Code will communicate with it by sending a structured payload via the FRAKTO_PAYLOAD environment variable. This payload contains detailed information about the active document and editor state.

The response from the external script will be handled as follows:

- **`formatted`**
  If present, this is used to format the active document when the `Format Document` command is executed.

- **`diagnostics`**
  These are used to run lint-style diagnostics on the code. Diagnostics are triggered:
  - after formatting a document,
  - when VSCode opens with documents already open,
  - when a document is opened,
  - when a document is edited,
  - when running the command `Frakto: Run a diagnostic on the current file`.

- **`debug`**
  Any value returned here will be sent to the VS Code developer console using `console.log()`.
  This is useful for debugging and development, and is printed on every extension event.

## Contributing

Contributions are welcome and encouraged.
If you'd like to help improve this plugin, please open a pull request or issue.

Make sure to follow our [contributing guidelines](https://github.com/fraktodev/frakto-code-engine/blob/main/.github/CONTRIBUTING.md) before submitting any changes.

## License

MIT License — Copyright © 2025 [Frakto](https://github.com/fraktodev/)

## Support this project

This project is maintained with love and dedication. If you find it helpful, please consider:

[![Leave a Review](https://img.shields.io/badge/Leave-a_Review-4A90E2?style=flat&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=frakto.frakto-code-engine&ssr=false#review-details)
[![Star on GitHub](https://img.shields.io/badge/GitHub-Star-4A90E2?style=flat&logo=github)](https://github.com/fraktodev/frakto-code-engine)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me-a%20Coffee-E67E22.svg?logo=buymeacoffee&logoColor=white)](https://coff.ee/danybranding)
[![Become a Sponsor](https://img.shields.io/badge/GitHub-Sponsor-8B5CF6?style=flat&logo=github)](https://github.com/sponsors/danybranding)
