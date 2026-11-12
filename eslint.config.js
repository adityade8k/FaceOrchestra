import globals from "globals";
const unusedImports = {
  meta: { type: "problem", schema: [], messages: { unused: "Unused import '{{name}}'." } },
  create(context) {
    return {
      "Program:exit"() {
        for (const node of context.sourceCode.ast.body) {
          if (node.type !== "ImportDeclaration") continue;
          for (const variable of context.sourceCode.getDeclaredVariables(node)) {
            if (!variable.references.length)
              context.report({
                node: variable.identifiers[0],
                messageId: "unused",
                data: { name: variable.name },
              });
          }
        }
      },
    };
  },
};

export default [
  {
    ignores: [
      "node_modules/**",
      "vendor/**",
      "model/**",
      "captures/**",
      "capture-exports/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        currentFrame: "readonly",
        sampleRate: "readonly",
      },
    },
    plugins: { repository: { rules: { "unused-imports": unusedImports } } },
    rules: { "no-undef": "error", "no-dupe-keys": "error", "repository/unused-imports": "error" },
  },
];
