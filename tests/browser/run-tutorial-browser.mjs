// Compatibility entry point; selection and shared follow-ups live in suites.mjs.
import { tutorialSuiteFromEnvironment } from "./suites.mjs";
import { runBrowserSuites } from "./suiteRunner.mjs";
await runBrowserSuites([tutorialSuiteFromEnvironment()]);
