import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { it } from 'node:test';
import type * as TypeScript from 'typescript';

/** Usa o compilador do app: o tipo vindo de bibliotecas também pode propagar `any`. */
it('configurações do app não propagam any para variáveis ou parâmetros', () => {
  const root = resolve(__dirname, '../../../..');
  const ts = createRequire(resolve(root, 'package.json'))('typescript') as typeof TypeScript;
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const found: string[] = [];
  for (const relative of ['app.config.ts', 'src/config.ts', 'src/services/notificationService.ts']) {
    const source = program.getSourceFile(resolve(root, relative));
    assert.ok(source);
    function visit(node: TypeScript.Node): void {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
        if (checker.getTypeAtLocation(node.name).flags & ts.TypeFlags.Any) {
          const position = source!.getLineAndCharacterOfPosition(node.name.getStart());
          found.push(`${relative}:${position.line + 1} ${node.name.text}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(found, []);
});
