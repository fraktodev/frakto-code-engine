// Dependencies
import path from 'path';

// Export
export default {
	target: 'node',
	entry: './src/extension.mts',
	output: {
		path: path.resolve(path.dirname(new URL(import.meta.url).pathname)),
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
