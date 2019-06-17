import * as path from "path";
import * as stream from "stream";
import * as vs from "vscode";
import { LanguageClient, LanguageClientOptions, StreamInfo } from "vscode-languageclient";
import { dartVMPath } from "../../shared/constants";
import { Sdks } from "../../shared/interfaces";
import { config } from "../config";
import { safeSpawn } from "../utils/processes";

export let lspClient: LanguageClient;

export function initLSP(context: vs.ExtensionContext, sdks: Sdks) {
	vs.window.showInformationMessage("LSP preview is enabled!");
	const client = startLsp(context, sdks);
	return {
		dispose: async (): Promise<void> => (await client).dispose(),
	};
}

async function startLsp(context: vs.ExtensionContext, sdks: Sdks): Promise<vs.Disposable> {
	const clientOptions: LanguageClientOptions = {
		// Keep in sync with isAnalyzable().
		documentSelector: [
			{ scheme: "file", language: "dart" },
			{ scheme: "file", language: "html" },
			{ scheme: "file", language: "yaml", pattern: "**/pubspec.yaml" },
			{ scheme: "file", language: "yaml", pattern: "**/analysis_options.yaml" },
		],
		// initializationOptions: {
		// 	onlyAnalyzeProjectsWithOpenFiles: true,
		// },
		outputChannelName: "LSP",
	};

	lspClient = new LanguageClient(
		"dartAnalysisLSP",
		"Dart Analysis Server",
		() => spawn(sdks),
		clientOptions,
	);

	return lspClient.start();
}

function spawn(sdks: Sdks): Thenable<StreamInfo> {
	// TODO: Replace with constructing an Analyzer that passes LSP flag (but still reads config
	// from paths etc) and provide it's process.
	const vmPath = path.join(sdks.dart, dartVMPath);
	const args = config.previewLspArgs;

	const process = safeSpawn(undefined, vmPath, args);

	console.log(vmPath);
	console.log(args);

	const reader = process.stdout.pipe(new LoggingTransform("<=="));
	const writer = new LoggingTransform("==>");
	writer.pipe(process.stdin);

	return Promise.resolve({ reader, writer });
}

class LoggingTransform extends stream.Transform {
	constructor(private prefix: string, opts?: stream.TransformOptions) {
		super(opts);
	}
	public _transform(chunk: any, encoding: string, callback: () => void): void {
		console.log(`${this.prefix} ${chunk}`);
		this.push(chunk, encoding);
		callback();
	}
}
