'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
vm.runInThisContext(
    fs.readFileSync(path.join(rootDir, 'lib', 'TreeMatchLib.js'), 'utf8'),
    { filename: 'TreeMatchLib.js' }
);

const JsonCstImport = require(path.join(rootDir, 'json-cst-import.js'));
const TestTree = useNewTreeClass('JsonCstTestTree', '__A', '__B');

function importTree(value, options) {
    return JsonCstImport.importJsonSyntaxTree(value, TestTree, options);
}

function rootOf(value, options) {
    return importTree(value, options).GetRootNode();
}

function assertBasicTree(root) {
    assert.equal(root.Attr0(), 'Root');
    assert.equal(root.Attr1(), 'root-value');
    assert.equal(root.GetAttribute('line'), 1);
    assert.equal(root.NumChildren(), 1);
    assert.equal(root.NthChildNode(0).Attr0(), 'Leaf');
    assert.equal(root.NthChildNode(0).Attr1(), 'x');
}

// 1. Primary / Secondary / normal attributes are directly on each node.
{
    const root = rootOf({
        name: 'Root',
        value: 'root-value',
        line: 1,
        child: [{ name: 'Leaf', value: 'x', child: [] }],
    }, {
        keys: { primary: 'name', secondary: 'value', children: 'child', attributes: 'attr' },
        lookup: { primary: 'node', secondary: 'node', others: 'node' },
    });
    assertBasicTree(root);
}

// 2. All attributes are inside attr; children remain in the fixed child array.
{
    const root = rootOf({
        attr: { name: 'Root', value: 'root-value', line: 1 },
        child: [{ attr: { name: 'Leaf', value: 'x' }, child: [] }],
    }, {
        keys: { primary: 'name', secondary: 'value', children: 'child', attributes: 'attr' },
        lookup: { primary: 'attr', secondary: 'attr', others: 'attr' },
    });
    assertBasicTree(root);
}

// 3. Primary and Secondary are on the node; normal attributes are in attr.
{
    const root = rootOf({
        name: 'Root',
        value: 'root-value',
        attr: { line: 1 },
        child: [{ name: 'Leaf', value: 'x', attr: {}, child: [] }],
    }, {
        keys: { primary: 'name', secondary: 'value', children: 'child', attributes: 'attr' },
        lookup: { primary: 'node', secondary: 'node', others: 'attr' },
    });
    assertBasicTree(root);
}

// 4. Primary is on the node, while Secondary and normal attributes are in attr.
{
    const root = rootOf({
        name: 'Root',
        attr: { value: 'root-value', line: 1 },
        child: [{ name: 'Leaf', attr: { value: 'x' }, child: [] }],
    }, {
        keys: { primary: 'name', secondary: 'value', children: 'child', attributes: 'attr' },
        lookup: { primary: 'node', secondary: 'attr', others: 'attr' },
    });
    assertBasicTree(root);
}

// Node + Attr merges normal attributes with the direct node value taking priority.
{
    const root = rootOf({
        name: 'Root',
        color: 'node-color',
        attr: { color: 'attr-color', depth: 2 },
        child: [],
    });
    assert.equal(root.GetAttribute('color'), 'node-color');
    assert.equal(root.GetAttribute('depth'), 2);
    assert.deepEqual(root.AttributeKeysNonPrimary().sort(), ['color', 'depth']);
}

// Missing Secondary and missing/empty Children are both valid leaf forms.
{
    const withoutChildren = rootOf({ name: 'Leaf' });
    const emptyChildren = rootOf({ name: 'Leaf', child: [] });
    assert.equal(withoutChildren.Attr1(), null);
    assert.equal(withoutChildren.NumChildren(), 0);
    assert.equal(emptyChildren.NumChildren(), 0);
}

// Configured key names and lookup modes are not fixed to the defaults.
{
    const root = rootOf({
        kind: 'Root',
        props: { text: 'configured', flag: true },
        nodes: [{ kind: 'Leaf', props: { text: 'child' } }],
    }, {
        keys: { primary: 'kind', secondary: 'text', children: 'nodes', attributes: 'props' },
        lookup: { primary: 'node-first', secondary: 'attr', others: 'both' },
    });
    assert.equal(root.Attr0(), 'Root');
    assert.equal(root.Attr1(), 'configured');
    assert.equal(root.GetAttribute('flag'), true);
    assert.equal(root.NthChildNode(0).Attr1(), 'child');
}

// Samples generated for every lookup combination can be imported again.
for (const primary of ['node', 'attr', 'node-first']) {
    for (const secondary of ['node', 'attr', 'node-first']) {
        for (const others of ['node', 'attr', 'both']) {
            const options = {
                keys: { primary: 'kind', secondary: 'text', children: 'nodes', attributes: 'props' },
                lookup: { primary, secondary, others },
            };
            const sample = JsonCstImport.generateSample(options);
            const root = rootOf(JSON.parse(sample), options);
            assert.equal(root.Attr0(), 'Expression');
            assert.equal(root.NumChildren(), 1);
        }
    }
}

// __proto__ can be used as a configured Primary key without being consumed by
// JavaScript's legacy prototype setter during sample generation.
{
    const options = {
        keys: {
            primary: '__proto__',
            secondary: 'value',
            children: 'child',
            attributes: 'attr',
        },
        lookup: { primary: 'attr', secondary: 'node-first', others: 'both' },
    };
    const sample = JsonCstImport.generateSample(options);
    const parsedSample = JSON.parse(sample);

    assert.equal(
        Object.prototype.hasOwnProperty.call(parsedSample.attr, '__proto__'),
        true
    );
    assert.equal(parsedSample.attr.__proto__, 'Expression');

    const root = rootOf(parsedSample, options);
    assert.equal(root.Attr0(), 'Expression');
    assert.equal(root.NthChildNode(0).Attr0(), 'Identifier');
}

// A normal __proto__ attribute is retained as data. With Node + Attr, the
// direct node value still takes priority over the value inside attr.
{
    const input = JSON.parse(`{
        "name": "Root",
        "__proto__": "node-value",
        "attr": { "__proto__": "attr-value" },
        "child": []
    }`);
    const root = rootOf(input);

    assert.equal(root.GetAttribute('__proto__'), 'node-value');
    assert.equal(Object.prototype.hasOwnProperty.call(root.attr, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(root.attr), null);
    assert.equal(Object.prototype.polluted, undefined);
}

// Error paths identify the failing node or structural property.
assert.throws(
    () => rootOf({ value: 'missing-primary' }),
    error => error instanceof JsonCstImport.JsonCstImportError && error.path === '$'
);
assert.throws(
    () => rootOf({ name: 'Root', child: {} }),
    error => error.path === '$.child' && /must be an array/.test(error.message)
);
assert.throws(
    () => rootOf({ name: 'Root', child: [42] }),
    error => error.path === '$.child[0]' && /must be an object/.test(error.message)
);
assert.throws(
    () => JsonCstImport.parseJsonText('{\n  "name": "Root",\n}'),
    error => /Invalid JSON/.test(error.message) && /line/.test(error.message)
);

console.log('json-cst-import tests: passed');
