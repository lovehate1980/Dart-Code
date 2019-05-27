import * as vs from "vscode";
import { FakeCompletionItemProvider } from "../../../extension/providers/dart_completion_item_provider";
import { activate, currentDoc, ensureCompletion, extApi, flutterHelloWorldMainFile, getCompletionsAt, getPackages, positionOf, setTestContent } from "../../helpers";

describe("completion_item_provider", () => {

	// We have tests that require external packages.
	before("get packages", () => getPackages());
	beforeEach("activate flutterHelloWorldMainFile", () => activate(flutterHelloWorldMainFile));

	it("includes expected completions", async () => {
		const completions = await getCompletionsAt("new ^Text");

		ensureCompletion(completions, vs.CompletionItemKind.Constructor, "Text(…)", "Text");
		ensureCompletion(completions, vs.CompletionItemKind.Constructor, "Text.rich(…)", "Text.rich");
		ensureCompletion(completions, vs.CompletionItemKind.Constructor, "Padding(…)", "Padding");
	});

	describe("with SuggestionSet support", () => {
		beforeEach("ensure SuggestionSets are supported", function () {
			if (!extApi.analyzerCapabilities.supportsAvailableSuggestions)
				this.skip();
		});

		it.skip("log performance of completions", async () => {
			await setTestContent(`
main() {
  ProcessInf
}
		`);
			const count = 50;
			const startMemory = process.memoryUsage();
			const startTime = Date.now();

			for (let i = 0; i < count; i++) {
				const startMemoryInner = process.memoryUsage();
				const startTimeInner = Date.now();

				const completions = await getCompletionsAt("ProcessInf^");
				ensureCompletion(completions, vs.CompletionItemKind.Class, "ProcessInfo", "ProcessInfo");

				const heapChangeMbs = (process.memoryUsage().heapUsed - startMemoryInner.heapUsed) / 1024 / 1024;
				console.log(`Iteration #${i < 10 ? " " : ""}${i} took ${Date.now() - startTimeInner} ms to return ${completions.length} results, heap change was ${Math.round(heapChangeMbs)} MB`);
			}

			const heapChangeMbs = (process.memoryUsage().heapUsed - startMemory.heapUsed) / 1024 / 1024;
			console.log(`Total run took ${Date.now() - startTime} ms heap change was ${Math.round(heapChangeMbs)} MB`);
		});
	});

	describe("completion support", () => {
		it.skip("log performance of completions", async () => {
			await setTestContent(`
main() {
  ProcessInf
}
		`);
			const count = 50;
			const startMemory = process.memoryUsage();
			const startTime = Date.now();

			for (let i = 0; i < count; i++) {
				const startMemoryInner = process.memoryUsage();
				const startTimeInner = Date.now();

				const completions = await (vs.commands.executeCommand("vscode.executeCompletionItemProvider", currentDoc().uri, positionOf("ProcessInf^"), undefined) as Thenable<vs.CompletionList>);

				const heapChangeMbs = (process.memoryUsage().heapUsed - startMemoryInner.heapUsed) / 1024 / 1024;
				console.log(`Iteration #${i < 10 ? " " : ""}${i} took ${Date.now() - startTimeInner} ms to return ${completions.items.length} results, heap change was ${Math.round(heapChangeMbs)} MB`);
			}

			const heapChangeMbs = (process.memoryUsage().heapUsed - startMemory.heapUsed) / 1024 / 1024;
			console.log(`Total run took ${Date.now() - startTime} ms heap change was ${Math.round(heapChangeMbs)} MB`);
		});

		it.only("log performance of completions", async () => {
			await setTestContent(`
main() {
  ProcessInf
}
		`);
			const provider = new FakeCompletionItemProvider();

			const count = 50;
			const startMemory = process.memoryUsage();
			const startTime = Date.now();

			for (let i = 0; i < count; i++) {
				const startMemoryInner = process.memoryUsage();
				const startTimeInner = Date.now();

				const completions = await provider.provideCompletionItems(currentDoc(), positionOf("ProcessInf^"), undefined, undefined);

				const heapChangeMbs = (process.memoryUsage().heapUsed - startMemoryInner.heapUsed) / 1024 / 1024;
				console.log(`Iteration #${i < 10 ? " " : ""}${i} took ${Date.now() - startTimeInner} ms to return ${completions.items.length} results, heap change was ${Math.round(heapChangeMbs)} MB`);
			}

			const heapChangeMbs = (process.memoryUsage().heapUsed - startMemory.heapUsed) / 1024 / 1024;
			console.log(`Total run took ${Date.now() - startTime} ms heap change was ${Math.round(heapChangeMbs)} MB`);
		});
	});
});
