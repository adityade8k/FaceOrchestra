import { posix } from "node:path";

// Accept parsed modules: checks inspect declarations without importing runtime code.
export function architectureErrors(modules) {
  const errors = [];
  for (const [file, { ast, visitorKeys }] of modules) {
    if (!file.startsWith("src/")) continue;
    visit(ast, visitorKeys, (node) => {
      const source = [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(node.type)
        ? node.source?.value
        : node.type === "ImportExpression" && node.source.type === "Literal"
          ? node.source.value
          : null;
      if (typeof source !== "string") return;
      const target = modulePath(file, source);
      if (/^(?:tests|scripts|server|capture)\//.test(target) || source.startsWith("node:"))
        errors.push(
          `${file}:${node.loc.start.line}: application code cannot import tooling/server/editor code (${source})`,
        );
      if (
        /^src\/(?:audio|scene|instruments\/core)\//.test(file) &&
        /^src\/(?:app|xr|tutorial|navigation|performance)\//.test(target)
      )
        errors.push(
          `${file}:${node.loc.start.line}: foundation module cannot import orchestration (${source})`,
        );
    });
  }
  const hostFile = "src/app/runtime/RuntimeHost.js",
    host = modules.get(hostFile);
  if (!host) return errors;
  const imports = new Map();
  for (const node of host.ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    for (const specifier of node.specifiers)
      imports.set(specifier.local.name, {
        file: modulePath(hostFile, node.source.value),
        exported: specifier.imported?.name || "default",
      });
  }
  const declarations = declaredValues(host.ast);
  const klass = declarations.get("RuntimeHost");
  const owners = new Map();
  for (const method of klass?.body.body || []) {
    if (!method.static && method.kind !== "constructor")
      owners.set(propertyName(method), "RuntimeHost");
  }
  visit(host.ast, host.visitorKeys, (node) => {
    if (
      node.type !== "CallExpression" ||
      node.callee.type !== "MemberExpression" ||
      node.callee.object.name !== "Object" ||
      propertyName(node.callee) !== "assign"
    )
      return;
    const target = node.arguments[0];
    if (
      target?.type !== "MemberExpression" ||
      target.object.name !== "RuntimeHost" ||
      propertyName(target) !== "prototype"
    )
      return;
    for (const mixin of node.arguments.slice(1)) {
      const imported = imports.get(mixin.name);
      const ast = imported && modules.get(imported.file)?.ast;
      const value = ast && declaredValues(ast).get(imported.exported);
      if (value?.type !== "ObjectExpression") {
        errors.push(
          `${hostFile}: cannot inspect runtime mixin ${mixin.name || mixin.type}; use a named object export or explicit service`,
        );
        continue;
      }
      for (const property of value.properties) {
        const name = propertyName(property);
        if (!name) {
          errors.push(`${imported.file}: runtime mixin keys must be explicit names`);
          continue;
        }
        if (owners.has(name))
          errors.push(
            `${hostFile}: runtime method '${name}' from ${mixin.name} overwrites ${owners.get(name)}`,
          );
        else owners.set(name, mixin.name);
      }
    }
  });
  return errors;
}

function declaredValues(ast) {
  const values = new Map();
  for (const statement of ast.body) {
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (node?.type === "VariableDeclaration") {
      for (const declaration of node.declarations)
        if (declaration.id.type === "Identifier") values.set(declaration.id.name, declaration.init);
    } else if (node?.type === "ClassDeclaration") values.set(node.id.name, node);
  }
  return values;
}
function modulePath(file, source) {
  if (source.startsWith("/")) return source.slice(1);
  return source.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), source)) : source;
}
function propertyName(node) {
  const key = node.key || node.property;
  return !node.computed && key?.type === "Identifier"
    ? key.name
    : key?.type === "Literal"
      ? String(key.value)
      : null;
}
function visit(node, keys, callback) {
  callback(node);
  for (const key of keys[node.type] || []) {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    for (const child of children) if (child?.type) visit(child, keys, callback);
  }
}
