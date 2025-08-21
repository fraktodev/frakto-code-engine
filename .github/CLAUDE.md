# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Frakto Code Engine is a VS Code extension that acts as a universal bridge between VS Code and external formatting/linting tools. It's designed to be completely unopinionated - the extension provides the infrastructure to pipe content to external scripts and handle their responses, but doesn't include any built-in formatters or linters.

## Development Commands

```bash
# Clean build artifacts
npm run clean

# Production build (webpack)
npm run build

# Development build (TypeScript compiler)
npm run dev

# Watch mode for development
npm run watch

# Package extension for distribution
npm run vscode:package
```

## Architecture

### Core Components

- **Main Extension** (`src/extension.ts`): Single-file extension containing all logic
- **External Script Communication**: Uses `spawn` to execute Node.js scripts in configured directories
- **Payload System**: Structured JSON communication via `FRAKTO_PAYLOAD` environment variable

### Key Interfaces

```typescript
interface RequestPayload {
  mode: 'format' | 'lint' | 'both';
  language: string;
  content: string;
  linterStandard: string | null;
  fileName: string;
  filePath: string;
  // ... additional metadata
}

interface ResponsePayload {
  formatted: string | null;
  diagnostics: DiagnosticPayload[] | null;
  debug: any;
}
```

### Configuration System

- Language-overridable configuration using VS Code's `[languageId]` syntax
- Key settings: `execFile`, `enableFormat`, `enableDiagnostics`, `linterStandard`
- Global settings: `ignores` (glob patterns), `supportedLanguages`, `maxBuffer`, `changeDelay`

### External Script Requirements

External scripts must:

- Be Node.js scripts located at `{execFile}/index.js`
- Read JSON payload from `process.env.FRAKTO_PAYLOAD`
- Return valid JSON matching `ResponsePayload` interface via stdout
- Exit with code 0 for success

## Localization

- Uses VS Code's l10n system with `vscode.l10n.t()`
- English strings in `package.nls.json`
- Spanish translations in `package.nls.es.json`
- Localized bundles in `l10n/` directory

## Build System

- **Webpack**: Production builds for distribution
- **TypeScript**: Development builds and type checking
- **Target**: Node.js with VS Code API externals
- **Output**: Single `extension.js` file in root directory

## Development Guidelines

From `.github/copilot-instructions.md`:

- Follow lowercase commit message format: `type: description`
- Write production-ready, maintainable code
- Avoid unnecessary complexity
- Use strict TypeScript configuration
- Senior engineer-level craftsmanship expected
- Fully obey the `CONTRIBUTING.md` rules without deviation

## Testing External Scripts

Use the companion tool [frakto-coding-standards](https://github.com/fraktodev/frakto-coding-standards) as a reference implementation, or create simple test scripts following the payload interface.

## Syntax guidelines

### TypeScript

- Code must be compatible with **ESM and ES6**.
- Use `camelCase` for all variables, constants, and function names.
- Use `PascalCase` for class names.
- Prefer `const` by default; use `let` only when reassignment is required.
- Avoid `var` entirely.
- Use **arrow functions** for short callbacks and inline functions.
- Use **template literals** instead of string concatenation (`${}`).
- Always terminate statements with a **semicolon (`;`)**.
- Use **strict equality** (`===` / `!==`) at all times.
- Use **yoda conditions** (`if (5 === x)`) to avoid accidental assignment in conditions.
- Avoid **global variables**. Use closures or modules to encapsulate scope.
- Write **pure, modular functions**, unless mutation is explicitly necessary.
