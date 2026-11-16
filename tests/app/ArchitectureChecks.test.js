import test from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import { architectureErrors } from "../../scripts/architecture-rules.mjs";
import { planBrowserSuites, tutorialSuiteFromEnvironment } from "../browser/suites.mjs";

const importFrom = (names, path) => `import ${names} from ${JSON.stringify(path)};`;

function modules(files) {
  const parser = new Linter();
  return new Map(
    Object.entries(files).map(([file, source]) => {
      const messages = parser.verify(source, {
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      });
      assert.ok(!messages.some((message) => message.fatal), `${file} fixture must parse`);
      const { ast, visitorKeys } = parser.getSourceCode();
      return [file, { ast, visitorKeys }];
    }),
  );
}

test("foundation boundaries inspect imports and re-exports without matching comments or strings", () => {
  const errors = architectureErrors(
    modules({
      "src/audio/Voice.js": `
      // ${importFrom("x", "../app/Runtime.js")}
      const prose = ${JSON.stringify(importFrom("x", "../app/Runtime.js"))};
      export { value } from ${JSON.stringify("../tutorial/Lesson.js")};
      const load = () => import(${JSON.stringify("/tests/fixture.js")});
    `,
      "src/app/Main.js": importFrom("{ Voice }", "../audio/Voice.js"),
    }),
  );
  assert.equal(errors.length, 2);
  assert.ok(
    errors.some((message) => message.includes("foundation module cannot import orchestration")),
  );
  assert.ok(
    errors.some((message) =>
      message.includes("application code cannot import tooling/server/editor code"),
    ),
  );
});

test("runtime composition rejects silent method overwrites, including class methods and aliased imports", () => {
  const errors = architectureErrors(
    modules({
      "src/app/runtime/RuntimeHost.js": `
      ${importFrom("{ First as A }", "./First.js")}
      ${importFrom("{ Second }", "./Second.js")}
      export class RuntimeHost { dispose() {} }
      Object.assign(RuntimeHost.prototype, A, Second);
    `,
      "src/app/runtime/First.js": "export const First = { update() {}, dispose() {} };",
      "src/app/runtime/Second.js": "export const Second = { update() {}, start() {} };",
    }),
  );
  assert.equal(errors.length, 2);
  assert.ok(errors.some((message) => message.includes("'dispose' from A overwrites RuntimeHost")));
  assert.ok(errors.some((message) => message.includes("'update' from Second overwrites A")));
});

test("runtime composition permits disjoint methods and rejects uninspectable spreads", () => {
  const host = `${importFrom("{ Methods }", "./Methods.js")} export class RuntimeHost { dispose() {} } Object.assign(RuntimeHost.prototype, Methods);`;
  assert.deepEqual(
    architectureErrors(
      modules({
        "src/app/runtime/RuntimeHost.js": host,
        "src/app/runtime/Methods.js": "export const Methods = { update() {} };",
      }),
    ),
    [],
  );
  assert.match(
    architectureErrors(
      modules({
        "src/app/runtime/RuntimeHost.js": host,
        "src/app/runtime/Methods.js": "export const Methods = { ...hidden };",
      }),
    ).join("\n"),
    /keys must be explicit/,
  );
});

test("browser batch runs requested scenarios first and shared regressions only once", () => {
  assert.deepEqual(planBrowserSuites(["ports", "radial", "ports"]), [
    "ports",
    "radial",
    "manual-honks",
    "presentation",
  ]);
  assert.deepEqual(planBrowserSuites(["music"]), ["music"]);
  assert.throws(() => planBrowserSuites(["unknown"]), /Unknown browser suite/);
  assert.equal(tutorialSuiteFromEnvironment({ TUTORIAL_TEST: "ports" }), "ports");
  assert.throws(
    () => tutorialSuiteFromEnvironment({ TUTORIAL_TEST: "typo" }),
    /Unknown TUTORIAL_TEST/,
  );
});
