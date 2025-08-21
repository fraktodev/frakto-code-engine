// Dependencies
import path from 'path';
import { fileURLToPath } from 'url';

// Declarations
const fileName = fileURLToPath(import.meta.url);
const dirName  = path.dirname(fileName);

// Export
export default {
	target: 'node',
	entry: './src/extension.mts',
	output: {
		path: path.resolve(dirName),
		filename: 'extension.js',
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '[resource-path]'
	},
	devtool: 'source-map',
	externals: {
		vscode: 'commonjs vscode'
	},
	resolve: {
		extensions: ['.mts']
	},
	module: {
		rules: [
			{
				test: /\.mts$/,
				loader: 'ts-loader'
			}
		]
	}
};
