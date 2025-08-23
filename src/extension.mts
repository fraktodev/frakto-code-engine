// Dependencies
import { spawn } from 'child_process';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';

// Configs
const fraktoConfig       = vscode.workspace.getConfiguration('frakto');

const ignores            = fraktoConfig.get<string[]>('ignores') ?? [];
const supportedLanguages = fraktoConfig.get<string[]>('supportedLanguages') ?? [];
const maxBuffer          = fraktoConfig.get<number>('maxBuffer') ?? 1048576;
const debounceTime       = fraktoConfig.get<number | 0>('debounceTime') ?? 1000;

// Globals
const channel    = vscode.window.createOutputChannel('Frakto Code Engine');
const diagnostic = vscode.languages.createDiagnosticCollection('Frakto');

// Definitions
type RunMode = 'format' | 'lint' | 'both';
type EventType = 'onStart' | 'onOpen' | 'onChange' | 'onRunDiagnostic' | 'onFormat';
interface RequestPayload {
	mode: RunMode;
	trigger: EventType;
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

/**
 * Retrieves the overridable configuration value for a specific key and document.
 *
 * @param key      - The configuration key to retrieve.
 * @param document - The VS Code text document to retrieve the configuration for.
 */
const getOverridableConfig = (key: string, document: vscode.TextDocument): any => {
	const languageId = document.languageId;
	const config     = vscode.workspace.getConfiguration(undefined, document.uri);

	const override   = config.get(`[${languageId}]`) as any;

	if (override && 'undefined' !== typeof override[`frakto.${key}`]) {
		return override[`frakto.${key}`];
	}

	return vscode.workspace.getConfiguration('frakto', document.uri).get(key);
};

/**
 * Builds the payload with metadata, config, and context to let the external script handle formatting,
 * diagnostics, or both, depending on the selected mode.
 *
 * @param mode     - Execution mode indicating whether to run formatting, diagnostics, or both.
 * @param trigger  - The event that triggered the execution.
 * @param content  - Text content to process; can be full document or a selected range.
 * @param document - The VS Code text document from which the content and metadata are derived.
 */
const buildRequestPayload = (
	mode: RunMode,
	trigger: EventType,
	content: string,
	document: vscode.TextDocument
): RequestPayload => {
	return {
		mode,
		trigger: trigger,
		language: document.languageId,
		content: content,
		linterStandard: getOverridableConfig('linterStandard', document),
		fileName: path.basename(document.uri.fsPath),
		filePath: document.uri.fsPath,
		fileEncoding: document.isClosed ? 'unknown' : document.eol === vscode.EndOfLine.LF ? 'utf8' : 'utf8-bom',
		fileIsUntitled: document.isUntitled,
		fileIsDirty: document.isDirty,
		workspacePath: vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath,
		maxBuffer,
		vscodeVersion: vscode.version,
		timestamp: Date.now()
	};
};

/**
 * Validates that a given value conforms to the ResponsePayload interface.
 *
 * @param possiblePayload - The value to validate.
 */
const isValidResponsePayload = (possiblePayload: unknown): possiblePayload is ResponsePayload => {
	if ('object' !== typeof possiblePayload || null === possiblePayload || Array.isArray(possiblePayload)) {
		return false;
	}

	const keys           = Object.keys(possiblePayload);
	const requiredKeys   = ['formatted', 'diagnostics'];
	const optionalKeys   = ['debug'];

	const hasAllRequired = requiredKeys.every((k) => keys.includes(k));
	const hasOnlyAllowed = keys.every((k) => [...requiredKeys, ...optionalKeys].includes(k));

	if (!hasAllRequired || !hasOnlyAllowed) {
		return false;
	}

	const payload            = possiblePayload as ResponsePayload;
	const isFormattedValid   = 'string' === typeof payload.formatted || null === payload.formatted;
	const isDiagnosticsValid =
		null === payload.diagnostics ||
		(Array.isArray(payload.diagnostics) &&
			payload.diagnostics.every((diagnosticItem) => {
				const diagKeys         = Object.keys(diagnosticItem);
				const requiredDiagKeys = ['line', 'column', 'type', 'message', 'source', 'code'];
				const optionalDiagKeys = ['endLine', 'endColumn'];

				const hasAllRequired   = requiredDiagKeys.every((k) => diagKeys.includes(k));
				const hasOnlyAllowed   = diagKeys.every((k) => [...requiredDiagKeys, ...optionalDiagKeys].includes(k));

				return (
					hasAllRequired &&
					hasOnlyAllowed &&
					'number' === typeof diagnosticItem.line &&
					'number' === typeof diagnosticItem.column &&
					['ERROR', 'WARNING', 'INFO'].includes(diagnosticItem.type) &&
					'string' === typeof diagnosticItem.message &&
					'string' === typeof diagnosticItem.source &&
					'string' === typeof diagnosticItem.code &&
					(undefined === diagnosticItem.endLine || 'number' === typeof diagnosticItem.endLine) &&
					(undefined === diagnosticItem.endColumn || 'number' === typeof diagnosticItem.endColumn)
				);
			}));

	return isFormattedValid && isDiagnosticsValid;
};

/**
 * Checks if a file path is ignored based on a list of glob patterns.
 *
 * @param filePath - The path of the file to check.
 * @param patterns - The glob patterns to match against.
 */
const isIgnored = (filePath: string, patterns: string[]): boolean => {
	if (0 === patterns.length) {
		return false;
	}

	return patterns.some((pattern) => minimatch(filePath, pattern));
};

/**
 * Runs the external linter/formatter script with document content or a range, sending a payload and handling results.
 *
 * @param mode     - The operation mode.
 * @param trigger  - The event that triggered the execution.
 * @param document - The VS Code text document to process.
 * @param range    - Optional. The range to process; if omitted, processes the whole document.
 */
const runExternal = async (
	mode: RunMode,
	trigger: EventType,
	document: vscode.TextDocument,
	range?: vscode.Range
): Promise<vscode.TextEdit[] | void> => {
	const execFile = getOverridableConfig('execFile', document);

	if ('' === execFile) {
		throwError(vscode.l10n.t('No execution path configured. Please check your settings.'));
		return;
	}

	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';

		const content = range ? document.getText(range) : document.getText();
		const payload = buildRequestPayload(mode, trigger, content, document);
		const options = {
			maxBuffer: maxBuffer,
			cwd: path.dirname(execFile),
			env: {
				...process.env,
				// eslint-disable-next-line
				FRAKTO_PAYLOAD: JSON.stringify(payload)
			}
		};
		const child   = spawn('node', [execFile], options);

		child.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		child.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		child.on('close', (code) => {
			// Handle errors from the external script.
			if (0 !== code) {
				throwError(stderr || vscode.l10n.t('Script failed with code {code}.', { code: code }));
				return reject(new Error(stderr || `Exit code ${code}`));
			}

			// Parse the JSON output from the external script.
			let parsed: unknown;
			try {
				parsed = JSON.parse(stdout || 'null');
			}
			catch (error: any) {
				throwError(
					vscode.l10n.t('Invalid JSON received from external script.\n{error}', {
						error: error?.message ?? String(error)
					})
				);
				return reject(new Error('Invalid JSON from external script'));
			}

			// Validate the structure of the response.
			if (!isValidResponsePayload(parsed)) {
				throwError(
					vscode.l10n.t('Payload does not match the expected shape. Received:\n{stdout}', {
						stdout: String(stdout || '<empty>')
					})
				);
				return reject(new Error('Invalid payload shape'));
			}

			// Debug log
			if (parsed.debug) {
				// eslint-disable-next-line
				console.log(parsed.debug);
			}

			// Handle formatting
			if ('format' === mode) {
				const newText   = parsed.formatted;
				const editRange = range || new vscode.Range(document.positionAt(0), document.positionAt(content.length));
				const edits     = 'string' === typeof newText ? [vscode.TextEdit.replace(editRange, newText)] : [];

				return resolve(edits);
			}

			// Handle diagnostics
			if ('lint' === mode) {
				publishDiagnostics(parsed.diagnostics, document);
				return resolve();
			}

			// Handle formatting and diagnostics
			if ('both' === mode) {
				const newText   = parsed.formatted;
				const editRange = range || new vscode.Range(document.positionAt(0), document.positionAt(content.length));
				const edits     = 'string' === typeof newText ? [vscode.TextEdit.replace(editRange, newText)] : [];

				publishDiagnostics(parsed.diagnostics, document);
				return resolve(edits);
			}

			return resolve();
		});
	});
};

/**
 * Formats a document or a specific range using the external formatter.
 * Runs the configured formatter and replaces the content with the formatted result.
 *
 * @param document - The VS Code text document to process.
 * @param range    - Optional. The range to process; if omitted, formats the whole document.
 */
const runFormat = async (document: vscode.TextDocument, range?: vscode.Range): Promise<vscode.TextEdit[]> => {
	const mode = false === getOverridableConfig('enableDiagnostics', document) ? 'format' : 'both';
	return (await runExternal(mode, 'onFormat', document, range)) as vscode.TextEdit[];
};

/**
 * Analyzes a document for issues and publishes diagnostics to VS Code.
 * Runs the external diagnostic process and updates the diagnostic collection.
 *
 * @param trigger  - The event that triggered the execution.
 * @param document - The VS Code text document to process.
 * @param message  - Optional. If true, shows an information message upon completion.
 */
const runDiagnostic = async (trigger: EventType, document: vscode.TextDocument, message?: boolean): Promise<void> => {
	await runExternal('lint', trigger, document).finally(() => {
		if (message) {
			vscode.window.setStatusBarMessage(vscode.l10n.t('Analysis completed successfully.'), 3000);
		}
	});
};

/**
 * Processes the diagnostics payload and publishes the diagnostics to the provided collection.
 *
 * @param diagnostics - The payload.diagnostics array received from the external tool.
 * @param document    - The text document to diagnose.
 */
const publishDiagnostics = (diagnostics: DiagnosticPayload[] | null, document: vscode.TextDocument): void => {
	if (!Array.isArray(diagnostics)) {
		return;
	}

	const diagnosticsList: vscode.Diagnostic[] = [];

	for (const diagnostic of diagnostics) {
		let range;

		if (diagnostic.endLine && diagnostic.endColumn) {
			range = new vscode.Range(
				new vscode.Position(diagnostic.line - 1, diagnostic.column - 1),
				new vscode.Position(diagnostic.endLine - 1, diagnostic.endColumn - 1)
			);
		}
		else {
			const lineText    = document.lineAt(diagnostic.line - 1).text;
			const startColumn = diagnostic.column - 1;
			let endColumn = startColumn;

			while (endColumn < lineText.length && /\w/.test(lineText[endColumn])) {
				endColumn++;
			}

			range = new vscode.Range(
				new vscode.Position(diagnostic.line - 1, startColumn),
				new vscode.Position(diagnostic.line - 1, endColumn)
			);
		}

		let severity: vscode.DiagnosticSeverity;
		switch (diagnostic.type) {
			case 'ERROR':
				severity = vscode.DiagnosticSeverity.Error;
				break;
			case 'WARNING':
				severity = vscode.DiagnosticSeverity.Warning;
				break;
			default:
				severity = vscode.DiagnosticSeverity.Information;
				break;
		}

		const diagnosticObject = new vscode.Diagnostic(range, diagnostic.message, severity);

		diagnosticObject.source = diagnostic.source;
		diagnosticObject.code = diagnostic.code;
		diagnosticsList.push(diagnosticObject);
	}

	diagnostic.set(document.uri, diagnosticsList);
};

/**
 * Displays a message in the output channel.
 *
 * @param message - The message to display.
 */
const throwError = (message: string): void => {
	const now       = new Date();
	const timestamp = now.toLocaleString();

	channel.show(true);
	channel.appendLine(`[ERROR][${timestamp}]:`);
	channel.appendLine(message);
};

/**
 * Determines whether a document should be processed by the extension.
 *
 * @param document - The VS Code text document to check.
 * @param check    - The enable option to check.
 */
const shouldProcessDocument = (document: vscode.TextDocument, check: string): boolean => {
	if (false === getOverridableConfig(check, document)) {
		return false;
	}

	if (isIgnored(document.uri.fsPath, ignores)) {
		return false;
	}

	if ('file' !== document.uri.scheme) {
		return false;
	}

	if (!supportedLanguages.includes(document.languageId)) {
		return false;
	}

	return true;
};

/**
 * Entry point for the Frakto lint extension.
 * Registers formatting and diagnostic providers for supported languages,
 * sets up output channels, and manages extension lifecycle events.
 *
 * @param context - Extension context provided by VS Code.
 */
export const activate = (context: vscode.ExtensionContext): void => {
	let changeTimeout: NodeJS.Timeout;
	context.subscriptions.push(channel, diagnostic);

	// Check for supported languages
	if (0 === supportedLanguages.length) {
		throwError(vscode.l10n.t('No supported languages configured. Please check your settings.'));
		return;
	}

	// Run diagnostics for already open documents
	vscode.workspace.textDocuments.forEach((document) => {
		if (!shouldProcessDocument(document, 'enableDiagnostics')) {
			return;
		}

		runDiagnostic('onStart', document);
	});

	// Register run diagnostics command
	context.subscriptions.push(
		vscode.commands.registerCommand('frakto.runDiagnostics', () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor) {
				vscode.window.showWarningMessage(vscode.l10n.t('Frakto: No active file to analyze.'));
				return;
			}

			if (!shouldProcessDocument(editor.document, 'enableDiagnostics')) {
				return;
			}

			runDiagnostic('onRunDiagnostic', editor.document, true);
		})
	);

	// Register event listeners
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (!shouldProcessDocument(document, 'enableDiagnostics')) {
				return;
			}

			runDiagnostic('onOpen', document);
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (
				!shouldProcessDocument(event.document, 'enableDiagnostics') ||
				0 === debounceTime ||
				1 > event.contentChanges.length
			) {
				return;
			}

			clearTimeout(changeTimeout);
			changeTimeout = setTimeout(() => {
				runDiagnostic('onChange', event.document);
			}, debounceTime);
		})
	);

	// Register formatting providers for supported languages
	supportedLanguages.forEach((language) => {
		context.subscriptions.push(
			vscode.languages.registerDocumentFormattingEditProvider(language, {
				provideDocumentFormattingEdits(document) {
					if (!shouldProcessDocument(document, 'enableFormat')) {
						return [];
					}

					return runFormat(document);
				}
			}),
			vscode.languages.registerDocumentRangeFormattingEditProvider(language, {
				provideDocumentRangeFormattingEdits(document, range) {
					if (!shouldProcessDocument(document, 'enableFormat')) {
						return [];
					}

					return runFormat(document, range);
				}
			})
		);
	});
};
