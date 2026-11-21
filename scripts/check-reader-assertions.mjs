/** The split reader journeys must retain every assertion from the feature commit. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "frontend/package.json"));
const ts = require("typescript");
const printer = ts.createPrinter({ removeComments: true });
const contractPath = resolve(
  root,
  "frontend/tests/contracts/reader-assertions.json",
);

function assertions(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const entries = [];
  function visit(node) {
    if (
      ts.isExpressionStatement(node) &&
      /^(?:await\s+)?expect\s*\(/.test(node.getText(source))
    ) {
      const text = printer
        .printNode(ts.EmitHint.Unspecified, node, source)
        .replace(/\s+/g, " ")
        .trim();
      let owner = node.parent;
      while (
        owner &&
        !ts.isFunctionDeclaration(owner) &&
        !(
          ts.isCallExpression(owner) &&
          owner.expression.getText(source) === "test"
        )
      )
        owner = owner.parent;
      entries.push({
        hash: createHash("sha256").update(text).digest("hex"),
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        owner:
          owner && ts.isCallExpression(owner)
            ? owner.arguments[0].text
            : (owner?.name?.text ?? "fixture"),
        text,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries;
}

if (process.argv[2] === "--capture") {
  // Maintainer-only: pass the original committed source, never a shortened replacement.
  writeFileSync(
    contractPath,
    JSON.stringify(
      { baseline: "a24a6ef", assertions: assertions(process.argv[3]) },
      null,
      2,
    ) + "\n",
  );
} else {
  const baseline = JSON.parse(readFileSync(contractPath, "utf8")).assertions;
  const current = ["performance-review.spec.ts", "reader-fixtures.ts"].flatMap(
    (file) =>
      assertions(resolve(root, "frontend/tests/e2e", file)).map((entry) => ({
        ...entry,
        file,
      })),
  );
  const remaining = [...current];
  const mapping = baseline.map((entry) => {
    const index = remaining.findIndex(
      (candidate) => candidate.hash === entry.hash,
    );
    if (index < 0)
      throw new Error(
        `Missing reader assertion from ${entry.owner}, original line ${entry.line}: ${entry.text}`,
      );
    const [successor] = remaining.splice(index, 1);
    return {
      originalLine: entry.line,
      originalOwner: entry.owner,
      file: successor.file,
      line: successor.line,
      owner: successor.owner,
    };
  });
  console.log(
    `Preserved ${mapping.length} original reader assertions; ${remaining.length} additional prerequisite checks.`,
  );
  if (process.env.E2E_ASSERTION_MAP)
    writeFileSync(
      process.env.E2E_ASSERTION_MAP,
      JSON.stringify(mapping, null, 2),
    );
}
