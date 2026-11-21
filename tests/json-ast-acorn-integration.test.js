'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');
const fixtureDir = path.join(__dirname, 'fixtures', 'json-ast-acorn');
const parseOptions = {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
};

vm.runInThisContext(
    fs.readFileSync(path.join(rootDir, 'lib', 'TreeMatchLib.js'), 'utf8'),
    { filename: 'TreeMatchLib.js' }
);

const JsonAstImport = require(path.join(rootDir, 'json-ast-import.js'));
const TestTree = useNewTreeClass('JsonAstAcornIntegrationTree', '__A', '__B');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));

function readFixture(name) {
    const source = fs.readFileSync(path.join(fixtureDir, `${name}.js`), 'utf8');
    const savedAst = JSON.parse(fs.readFileSync(path.join(fixtureDir, `${name}.json`), 'utf8'));
    const parsedAst = acorn.parse(source, parseOptions);
    // Exercise the same serialization boundary used when JSON is pasted.
    const serializedAst = JSON.parse(JSON.stringify(parsedAst));

    assert.deepEqual(savedAst, serializedAst, `${name}: saved AST must be reproducible`);
    return { source, ast: serializedAst };
}

function collectAstNodes(value, nodes = []) {
    if (Array.isArray(value)) {
        for (const item of value) collectAstNodes(item, nodes);
        return nodes;
    }
    if (!value || typeof value !== 'object') return nodes;

    if (typeof value.type === 'string') nodes.push(value);
    for (const child of Object.values(value)) collectAstNodes(child, nodes);
    return nodes;
}

function collectImportedRealNodes(node, nodes = []) {
    if (!node) return nodes;
    if (!JsonAstImport.isStructuralNode(node)) nodes.push(node);
    for (let index = 0; index < node.NumChildren(); index++) {
        collectImportedRealNodes(node.NthChildNode(index), nodes);
    }
    return nodes;
}

function typeCounts(nodes, typeOf) {
    const counts = Object.create(null);
    for (const node of nodes) {
        const type = typeOf(node);
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

function importFixture(name, options = {}) {
    const fixture = readFixture(name);
    const tree = JsonAstImport.importJsonAst(fixture.ast, TestTree, options);
    return { ...fixture, tree };
}

function structuralChild(node, propertyName) {
    return node.ChildNodeList().find(child => (
        JsonAstImport.getStructuralNodeInfo(child)?.propertyName === propertyName
    ));
}

function findFirstRealNode(node, type) {
    if (!node) return null;
    if (!JsonAstImport.isStructuralNode(node) && node.Attr0() === type) return node;
    for (let index = 0; index < node.NumChildren(); index++) {
        const found = findFirstRealNode(node.NthChildNode(index), type);
        if (found) return found;
    }
    return null;
}

function structuralPattern(node) {
    const info = JsonAstImport.getStructuralNodeInfo(node);
    assert.ok(info, 'expected a marked structural node');
    if (info.representation === 'property-name-primary') {
        return `${node.Attr0()}#${JSON.stringify(node.Attr1())}`;
    }
    return `.#${node.Attr1()}`;
}

assert.equal(manifest.parser.name, 'acorn');
assert.equal(manifest.parser.version, acorn.version);
assert.deepEqual(manifest.parser.options, parseOptions);

// Every real Acorn node survives serialization and import in the same
// traversal order. start/end/loc remain ordinary attributes on real nodes.
for (const fixture of manifest.fixtures) {
    const { ast, tree } = importFixture(fixture.name);
    const astNodes = collectAstNodes(ast);
    const importedNodes = collectImportedRealNodes(tree.GetRootNode());

    assert.equal(importedNodes.length, astNodes.length, `${fixture.name}: real-node count`);
    assert.deepEqual(
        typeCounts(importedNodes, node => node.Attr0()),
        typeCounts(astNodes, node => node.type),
        `${fixture.name}: node-type counts`
    );
    assert.deepEqual(
        importedNodes.map(node => node.Attr0()),
        astNodes.map(node => node.type),
        `${fixture.name}: real-node traversal order`
    );

    for (let index = 0; index < astNodes.length; index++) {
        const original = astNodes[index];
        const imported = importedNodes[index];
        assert.equal(imported.GetAttribute('start'), original.start);
        assert.equal(imported.GetAttribute('end'), original.end);
        assert.deepEqual(imported.GetAttribute('loc'), original.loc);
    }
}

// Property.value must remain a child node instead of being consumed as an
// automatically selected Secondary value.
{
    const { tree } = importFixture('02-property-value');
    assert.equal(TreeMatchFind(tree, 'Identifier#y').length, 1);
}

// Acorn represents an array hole as null in ArrayExpression.elements. The
// imported List field must preserve a / empty / b in exactly that order.
{
    const { tree } = importFixture('03-array-hole');
    const arrayExpression = findFirstRealNode(tree.GetRootNode(), 'ArrayExpression');
    const elements = structuralChild(arrayExpression, 'elements');

    assert.ok(elements);
    assert.equal(elements.NumChildren(), 3);
    assert.equal(elements.NthChildNode(0).Attr1(), 'a');
    assert.equal(elements.NthChildNode(1), null);
    assert.equal(elements.NthChildNode(2).Attr1(), 'b');
}

// Match counts required by the evaluation examples.
{
    const { tree } = importFixture('04-if-call');
    assert.equal(TreeMatchFind(tree, 'Identifier#score').length, 2);
    assert.equal(TreeMatchFind(tree, 'Identifier#print').length, 2);
    assert.equal(TreeMatchFind(tree, 'CallExpression').length, 2);
}

// Single capture identifies each call. Multi-capture returns each call's
// arguments in source order within that one match result.
{
    const { tree } = importFixture('05-function-calls');
    assert.equal(TreeMatchFind(tree, 'Identifier#x').length, 3);
    assert.equal(TreeMatchFind(tree, 'CallExpression').length, 2);

    const calls = TreeMatchFind(tree, 'CallExpression##CALL');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(result => result.Capture('CALL').Node().Attr0() === 'CallExpression'));

    const argumentMatches = TreeMatchFind(
        tree,
        'CallExpression > . (.#arguments > (.##@ARGS)*)'
    );
    assert.equal(argumentMatches.length, 2);
    assert.deepEqual(
        argumentMatches.map(result => result.MultiCapture('ARGS').map(capture => (
            [capture.Node().Attr0(), capture.Node().Attr1()]
        ))),
        [
            [['Identifier', 'x']],
            [['Literal', 'ok'], ['Identifier', 'x']],
        ]
    );
}

// Field and List field representations are independent. Across all four
// combinations, real nodes and the array-hole position remain unchanged.
{
    const combinations = [
        ['node-name-primary', 'node-name-primary'],
        ['property-name-primary', 'node-name-primary'],
        ['node-name-primary', 'property-name-primary'],
        ['property-name-primary', 'property-name-primary'],
    ];
    let baselineTypes = null;

    for (const [fieldRepresentation, listRepresentation] of combinations) {
        const { tree } = importFixture('03-array-hole', {
            fieldNodeRepresentation: fieldRepresentation,
            listFieldNodeRepresentation: listRepresentation,
        });
        const realTypes = collectImportedRealNodes(tree.GetRootNode()).map(node => node.Attr0());
        if (baselineTypes === null) baselineTypes = realTypes;
        else assert.deepEqual(realTypes, baselineTypes);

        const arrayExpression = findFirstRealNode(tree.GetRootNode(), 'ArrayExpression');
        const elements = structuralChild(arrayExpression, 'elements');
        const id = structuralChild(
            findFirstRealNode(tree.GetRootNode(), 'VariableDeclarator'),
            'id'
        );

        assert.equal(elements.NumChildren(), 3);
        assert.equal(elements.NthChildNode(0).Attr1(), 'a');
        assert.equal(elements.NthChildNode(1), null);
        assert.equal(elements.NthChildNode(2).Attr1(), 'b');
        assert.ok(TreeMatchFind(tree, structuralPattern(id)).length > 0);
        assert.ok(TreeMatchFind(tree, structuralPattern(elements)).length > 0);
        assert.equal(TreeMatchFind(tree, 'Identifier#a').length, 1);
        assert.equal(TreeMatchFind(tree, 'Identifier#b').length, 1);
    }
}

// The deterministic large fixture also has stable counts for manual Tree View
// scrolling and MATCH LIST checks.
{
    const { tree } = importFixture('06-large-generated');
    assert.equal(TreeMatchFind(tree, 'FunctionDeclaration').length, 40);
    assert.equal(TreeMatchFind(tree, 'CallExpression').length, 160);
    assert.equal(TreeMatchFind(tree, 'Identifier#print').length, 80);
}

console.log(`json-ast Acorn ${acorn.version} integration tests: passed`);
