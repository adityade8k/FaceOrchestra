import { browserSuites, tutorialSuiteFromEnvironment } from "./suites.mjs";
import { runBrowserSuites } from "./suiteRunner.mjs";

const [selection = "music", ...args] = process.argv.slice(2);
if (selection === "--list") {
  console.table(
    Object.entries(browserSuites).map(([suite, { cost, environment, coverage }]) => ({
      suite,
      cost,
      environment,
      coverage,
    })),
  );
} else {
  const requested = selection === "--batch" ? args : [selection];
  if (!requested.length) throw new Error("--batch requires one or more suite names.");
  // Keep the legacy environment alias working without a second suite registry.
  const suites = requested.map((id) =>
    id === "tutorial" && process.env.TUTORIAL_TEST ? tutorialSuiteFromEnvironment() : id,
  );
  await runBrowserSuites(suites, { args: selection === "--batch" ? [] : args });
}
