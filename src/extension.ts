// Dependencies.
import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

// Configs.
const fraktoConfig = vscode.workspace.getConfiguration('frakto');
const prettierConfig = vscode.workspace.getConfiguration('prettier');
const localize = nls.config({ messageFormat: nls.MessageFormat.bundle })();

const maxExecTime = fraktoConfig.get<number>('maxExecTime') || 8000;
const debounceTime = fraktoConfig.get<number>('debounceTime') || 1000;

// Globals.
const channel = vscode.window.createOutputChannel('Frakto Code Engine');
const diagnostic = vscode.languages.createDiagnosticCollection('Frakto');
const supportedLanguages = [
	'javascript',
	'typescript',
	'javascriptreact',
	'typescriptreact',
	'html',
	'css',
	'scss',
	'less',
	'json',
	'jsonc',
	'markdown',
	'php',
	'xml',
	'yaml',
	'toml',
	'sql',
	'shellscript',
	'bash',
	'python',
	'ruby'
];

// Definitions.
type RunMode = 'format' | 'lint' | 'both';
interface RequestPayload {
	mode: RunMode;
	language: string;
	content: string;
	linterStandard: string | null;
	fileName: string;
	filePath: string;
	fileEncoding: string;
	fileIsUntitled: boolean;
	fileIsDirty: boolean;
	workspacePath?: string;
	maxExecTime: number;
	vscodeVersion: string;
	timestamp: number;
	prettierConfig?: Record<string, unknown>;
}
interface ResponsePayload {
	formatted: string | null;
	diagnostics: DiagnosticPayload[] | null;
	debug: any;
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
	const config = vscode.workspace.getConfiguration(undefined, document.uri);

	const override = config.get(`[${languageId}]`) as any;

	if (override && typeof override[`frakto.${key}`] !== 'undefined') {
		return override[`frakto.${key}`];
	}

	return vscode.workspace.getConfiguration('frakto', document.uri).get(key);
};

/**
 * Builds the payload object to send to the external processing script.
 *
 * This payload contains all relevant metadata about the current document,
 * user configuration, and execution context, allowing the external script
 * to perform formatting, diagnostics, or both, depending on the selected mode.
 *
 * @param mode     - Execution mode indicating whether to run formatting, diagnostics, or both.
 * @param content  - The text content to be processed. May represent the entire document or a selected range.
 * @param document - The VS Code text document from which the content and metadata are derived.
 * @param range    - Optional. The specific range within the document to process. If omitted, the entire document is targeted.
 */
const buildRequestPayload = (mode: RunMode, content: string, document: vscode.TextDocument): RequestPayload => {
	return {
		mode,
		language: document.languageId,
		content: content,
		linterStandard: getOverridableConfig('linterStandard', document),
		fileName: path.basename(document.uri.fsPath),
		filePath: document.uri.fsPath,
		fileEncoding: document.isClosed ? 'unknown' : document.eol === vscode.EndOfLine.LF ? 'utf8' : 'utf8-bom',
		fileIsUntitled: document.isUntitled,
		fileIsDirty: document.isDirty,
		workspacePath: vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath,
		maxExecTime,
		vscodeVersion: vscode.version,
		timestamp: Date.now(),
		prettierConfig
	};
};

/**
 * Validates that a given value conforms to the ResponsePayload interface.
 *
 * @param possiblePayload - The value to validate.
 */
const isValidResponsePayload = (possiblePayload: unknown): possiblePayload is ResponsePayload => {
	if (typeof possiblePayload !== 'object' || possiblePayload === null || Array.isArray(possiblePayload)) {
		return false;
	}

	const keys = Object.keys(possiblePayload);
	const expectedKeys = ['formatted', 'diagnostics', 'debug'];
	if (keys.length !== expectedKeys.length || !expectedKeys.every((k) => keys.includes(k))) {
		return false;
	}

	const payload = possiblePayload as ResponsePayload;
	const isFormattedValid = typeof payload.formatted === 'string' || payload.formatted === null;
	const isDiagnosticsValid =
		payload.diagnostics === null ||
		(Array.isArray(payload.diagnostics) &&
			payload.diagnostics.every((diagnosticItem) => {
				const diagKeys = Object.keys(diagnosticItem);
				const requiredDiagKeys = ['line', 'column', 'type', 'message', 'source', 'code'];
				const optionalDiagKeys = ['endLine', 'endColumn'];

				const hasAllRequired = requiredDiagKeys.every((k) => diagKeys.includes(k));
				const hasOnlyAllowed = diagKeys.every((k) => [...requiredDiagKeys, ...optionalDiagKeys].includes(k));

				return (
					hasAllRequired &&
					hasOnlyAllowed &&
					typeof diagnosticItem.line === 'number' &&
					typeof diagnosticItem.column === 'number' &&
					['ERROR', 'WARNING', 'INFO'].includes(diagnosticItem.type) &&
					typeof diagnosticItem.message === 'string' &&
					typeof diagnosticItem.source === 'string' &&
					typeof diagnosticItem.code === 'string' &&
					(diagnosticItem.endLine === undefined || typeof diagnosticItem.endLine === 'number') &&
					(diagnosticItem.endColumn === undefined || typeof diagnosticItem.endColumn === 'number')
				);
			}));

	return isFormattedValid && isDiagnosticsValid && typeof payload.debug !== 'undefined';
};

/**
 * Executes the external linter/formatter script (`index.js`) using the provided document content
 * or a specified range. It sends a payload with relevant context, receives formatted content and diagnostics,
 * publishes diagnostics to VS Code, and logs errors or output to the extension channel.
 * Resolves with formatting edits if applicable, or void after diagnostics are published.
 *
 * @param mode     - The operation mode.
 * @param document - The VS Code text document to process.
 * @param range    - Optional. The range within the document to process. If omitted, processes the entire document.
 */
const runExternal = async (
	mode: RunMode,
	document: vscode.TextDocument,
	range?: vscode.Range
): Promise<vscode.TextEdit[] | void> => {
	return new Promise((resolve, reject) => {
		const execPath = getOverridableConfig('execPath', document);
		const content = range ? document.getText(range) : document.getText();
		const payload = buildRequestPayload(mode, content, document);
		const pathToFile = [path.join(execPath, 'index.js')];
		const options = {
			maxBuffer: maxExecTime,
			cwd: execPath,
			env: {
				...process.env,
				FRAKTO_PAYLOAD: JSON.stringify(payload)
			}
		};
		const callback = async (error: Error | null, stdout: string, stderr: string) => {
			// Handle errors from the external script
			if (error) {
				showMessage(error.message || stderr);
				return reject(error);
			}

			// Parse the JSON output from the external script
			let payload: unknown;
			try {
				payload = JSON.parse(stdout || 'null');
			} catch (error: any) {
				showMessage(
					localize(
						'message.invalidJson',
						'Invalid JSON received from external script.\n{0}',
						error?.message ?? String(error)
					)
				);
				return reject(new Error('Invalid JSON from external script'));
			}

			// Validate the structure of the payload
			if (!isValidResponsePayload(payload)) {
				showMessage(
					localize(
						'message.invalidPayload',
						'Payload does not match the expected shape.\nReceived:\n{0}',
						String(stdout || '<empty>')
					)
				);
				return reject(new Error('Invalid payload shape'));
			}

			// Debug
			if (payload.debug) {
				console.log(payload.debug);
			}

			// Handle formatting edits and diagnostics
			if (mode === 'both') {
				const newText = payload.formatted;
				const editRange = range || new vscode.Range(document.positionAt(0), document.positionAt(content.length));
				const edits = typeof newText === 'string' ? [vscode.TextEdit.replace(editRange, newText)] : [];

				if (Array.isArray(payload.diagnostics)) {
					publishDiagnostics(payload.diagnostics, document);
				}

				return resolve(edits);
			}

			// Handle diagnostics
			if (mode === 'lint') {
				if (Array.isArray(payload.diagnostics)) {
					publishDiagnostics(payload.diagnostics, document);
				}
				return resolve();
			}

			// Fallback
			return resolve();
		};

		const child = execFile('node', pathToFile, options, callback);
		child.stdin?.end();
	});
};

/**
 * Formats the text content of a document, optionally restricting the operation to a specific range.
 *
 * Executes the configured external formatter through the Frakto Universal Script, replacing the original
 * content with the formatted result. When a range is provided, only that portion is formatted; otherwise,
 * the entire document is processed.
 *
 * @param document - The VS Code text document to process.
 * @param range    - Optional. The range within the document to process. If omitted, processes the entire document.
 */
const runFormat = async (document: vscode.TextDocument, range?: vscode.Range): Promise<vscode.TextEdit[]> => {
	if (getOverridableConfig('enableFormat', document) === false) {
		return [];
	}

	try {
		const edits = (await runExternal('both', document, range)) as vscode.TextEdit[] | void;
		return Array.isArray(edits) ? edits : [];
	} catch {
		return [];
	}
};

/**
 * Analyzes a document for issues and returns diagnostics.
 *
 * Executes the configured external diagnostic process through the Frakto Universal Script,
 * producing a collection of diagnostics such as errors, warnings, and informational messages.
 * The results are published to the provided VS Code diagnostic collection.
 *
 * @param document - The VS Code text document to process.
 * @param alert    - Optional. If true, shows an information message upon completion.
 */
const runDiagnostic = async (document: vscode.TextDocument, alert?: boolean): Promise<void> => {
	if (getOverridableConfig('enableDiagnostics', document) === false) {
		return;
	}

	await runExternal('lint', document).finally(() => {
		if (alert) {
			vscode.window.showInformationMessage(localize('message.analysisComplete', 'Analysis completed successfully.'));
		}
	});
};

/**
 * Processes the diagnostics payload and publishes the diagnostics to the provided collection.
 *
 * @param diagnostics - The payload.diagnostics array received from the external tool.
 * @param document    - The text document to diagnose.
 */
const publishDiagnostics = (diagnostics: DiagnosticPayload[], document: vscode.TextDocument): void => {
	const diagnosticsList: vscode.Diagnostic[] = [];

	for (const diagnostic of diagnostics) {
		let range;

		if (diagnostic.endLine && diagnostic.endColumn) {
			range = new vscode.Range(
				new vscode.Position(diagnostic.line - 1, diagnostic.column - 1),
				new vscode.Position(diagnostic.endLine - 1, diagnostic.endColumn - 1)
			);
		} else {
			const lineText = document.lineAt(diagnostic.line - 1).text;
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
 * @param message The message to display.
 */
const showMessage = (message: string): void => {
	const now = new Date();
	const timestamp = now.toLocaleString();

	channel.show(true);
	channel.appendLine(`[ERROR] ${timestamp}:`);
	channel.appendLine(message);
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

	// Run diagnostics for already open documents
	vscode.workspace.textDocuments.forEach((document) => {
		if (supportedLanguages.includes(document.languageId)) {
			runDiagnostic(document);
		}
	});

	// Register run diagnostics command
	context.subscriptions.push(
		vscode.commands.registerCommand('frakto.runDiagnostics', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage(localize('message.noActiveFile', 'No active file to analyze.'));
				return;
			}
			runDiagnostic(editor.document, true);
		})
	);

	// Register event listeners
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (supportedLanguages.includes(document.languageId)) {
				runDiagnostic(document);
			}
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (!supportedLanguages.includes(event.document.languageId) || event.contentChanges.length < 1) {
				return;
			}

			clearTimeout(changeTimeout);
			changeTimeout = setTimeout(() => {
				runDiagnostic(event.document);
			}, debounceTime);
		})
	);

	// Register formatting providers for supported languages
	supportedLanguages.forEach((language) => {
		context.subscriptions.push(
			vscode.languages.registerDocumentFormattingEditProvider(language, {
				provideDocumentFormattingEdits(document) {
					return runFormat(document);
				}
			}),
			vscode.languages.registerDocumentRangeFormattingEditProvider(language, {
				provideDocumentRangeFormattingEdits(document, range) {
					return runFormat(document, range);
				}
			})
		);
	});
};
