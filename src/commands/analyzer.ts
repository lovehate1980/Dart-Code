import * as vs from "vscode";
import { Analyzer } from "../analysis/analyzer";
import { envUtils } from "../utils";

export class AnalyzerCommands {

	constructor(context: vs.ExtensionContext, analyzer: Analyzer) {
		context.subscriptions.push(vs.commands.registerCommand("dart.openAnalyzerDiagnostics", async () => {
			const res = await analyzer.diagnosticGetServerPort();
			await envUtils.openInBrowser(`http://localhost:${res.port}/`);
		}));
	}
}
