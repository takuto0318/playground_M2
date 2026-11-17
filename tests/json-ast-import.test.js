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

const JsonAstImport = require(path.join(rootDir, 'json-ast-import.js'));
const TestTree = useNewTreeClass('JsonAstTestTree', '__A', '__B');

function rootOf(value, options) {
    return JsonAstImport.importJsonAst(value, TestTree, options).GetRootNode();
}

function childByField(root, fieldName) {
    return root.ChildNodeList().find(node => node && node.Attr1() === fieldName);
}

// Existing JSON AST defaults: type is Primary and the first representative
// key (name/value/operator/kind) is Secondary.
{
    const tree = JsonAstImport.importJsonAst({
        type: 'Program',
        body: [{ type: 'Identifier', name: 'x' }],
    }, TestTree);
    const root = tree.GetRootNode();
    assert.equal(root.Attr0(), 'Program');
    assert.equal(root.Attr1(), null);
    const body = childByField(root, 'body');
    assert.equal(body.Attr0(), '__ListField');
    assert.equal(body.NthChildNode(0).Attr0(), 'Identifier');
    assert.equal(body.NthChildNode(0).Attr1(), 'x');
    assert.equal(body.NthChildNode(0).GetAttribute('name'), null);
    assert.ok(TreeMatch(tree, 'Program > .#body'));
}

// Automatic Secondary selection must not consume a candidate that is itself
// a child node. Property.value remains a __Field and is still matchable.
{
    const tree = JsonAstImport.importJsonAst({
        type: 'Property',
        key: { type: 'Identifier', name: 'x' },
        value: { type: 'Identifier', name: 'y' },
        kind: 'init',
    }, TestTree);
    const root = tree.GetRootNode();
    const valueField = childByField(root, 'value');

    assert.equal(root.Attr1(), 'init');
    assert.equal(valueField.Attr0(), '__Field');
    assert.equal(valueField.NthChildNode(0).Attr0(), 'Identifier');
    assert.equal(valueField.NthChildNode(0).Attr1(), 'y');
    assert.equal(TreeMatchFind(tree, 'Identifier#y').length, 1);

    const listRoot = rootOf({
        type: 'Collection',
        value: [{ type: 'Identifier', name: 'z' }],
        kind: 'items',
    });
    const valueList = childByField(listRoot, 'value');
    assert.equal(listRoot.Attr1(), 'items');
    assert.equal(valueList.Attr0(), '__ListField');
    assert.equal(valueList.NthChildNode(0).Attr1(), 'z');
}

// Primary and Secondary keys can be changed. An explicitly empty Secondary
// setting disables Secondary even if a legacy representative key is present.
{
    const configured = rootOf({
        kind: 'Root',
        label: 'configured',
        child: { kind: 'Leaf', label: 'leaf' },
    }, {
        keys: { primary: 'kind', secondary: 'label' },
    });
    assert.equal(configured.Attr0(), 'Root');
    assert.equal(configured.Attr1(), 'configured');
    assert.equal(childByField(configured, 'child').NthChildNode(0).Attr1(), 'leaf');

    const customPrimaryOnly = rootOf({ kind: 'Leaf' }, {
        keys: { primary: 'kind' },
    });
    assert.equal(customPrimaryOnly.Attr0(), 'Leaf');
    assert.equal(customPrimaryOnly.Attr1(), null);

    const withoutSecondary = rootOf({ type: 'Identifier', name: 'x' }, {
        keys: { primary: 'type', secondary: '' },
    });
    assert.equal(withoutSecondary.Attr1(), null);
    assert.equal(withoutSecondary.GetAttribute('name'), 'x');

    const missingSecondary = rootOf({ kind: 'Leaf', count: 1 }, {
        keys: { primary: 'kind', secondary: 'label' },
    });
    assert.equal(missingSecondary.Attr1(), null);

    const nullSecondary = rootOf({ kind: 'Leaf', label: null }, {
        keys: { primary: 'kind', secondary: 'label' },
    });
    assert.equal(nullSecondary.Attr1(), null);
    assert.equal(Object.prototype.hasOwnProperty.call(nullSecondary.attr, 'label'), false);
}

// Normal attributes retain their original values. Mixed arrays are attributes,
// and scalar null is an attribute under automatic classification.
{
    const mixed = [{ type: 'A' }, 42];
    const root = rootOf({
        type: 'Root',
        count: 3,
        flag: true,
        optional: null,
        unavailable: undefined,
        items: mixed,
    });
    assert.equal(root.GetAttribute('count'), 3);
    assert.equal(root.GetAttribute('flag'), true);
    assert.equal(root.GetAttribute('optional'), null);
    assert.equal(Object.prototype.hasOwnProperty.call(root.attr, 'optional'), true);
    assert.equal(root.GetAttribute('unavailable'), undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(root.attr, 'unavailable'), true);
    assert.strictEqual(root.GetAttribute('items'), mixed);
    assert.equal(childByField(root, 'items'), undefined);
}

// A single node property is wrapped in __Field. Empty arrays and arrays made
// entirely of nodes/null/undefined are wrapped in __ListField.
{
    const input = {
        type: 'Root',
        single: { type: 'Single' },
        empty: [],
        values: [
            { type: 'A' },
            null,
            { type: 'B' },
            undefined,
        ],
    };
    const root = rootOf(input);
    const single = childByField(root, 'single');
    const empty = childByField(root, 'empty');
    const values = childByField(root, 'values');

    assert.equal(single.Attr0(), '__Field');
    assert.equal(single.NthChildNode(0).Attr0(), 'Single');
    assert.equal(empty.Attr0(), '__ListField');
    assert.equal(empty.NumChildren(), 0);
    assert.equal(values.NumChildren(), 4);
    assert.equal(values.NthChildNode(0).Attr0(), 'A');
    assert.equal(values.NthChildNode(1), null);
    assert.equal(values.NthChildNode(2).Attr0(), 'B');
    assert.equal(values.NthChildNode(3), null);
    assert.doesNotThrow(() => TreeMatchFind(TestTree.newByRootNode(root), '.'));
}

// Programmatic classification is separate from conversion. Explicit node and
// node-list classifications preserve null/undefined child positions as empty nodes.
{
    const root = rootOf({
        type: 'Root',
        explicitNode: null,
        explicitList: [undefined, { type: 'Leaf' }],
    }, {
        classifyProperty({ key, automatic }) {
            if (key === 'explicitNode') return 'node';
            if (key === 'explicitList') return 'node-list';
            return automatic;
        },
    });
    const field = childByField(root, 'explicitNode');
    const list = childByField(root, 'explicitList');
    assert.equal(field.Attr0(), '__Field');
    assert.equal(field.NumChildren(), 1);
    assert.equal(field.NthChildNode(0), null);
    assert.equal(list.NthChildNode(0), null);
    assert.equal(list.NthChildNode(1).Attr0(), 'Leaf');
}

// The failing node's JSON path is included when Primary is missing.
assert.throws(
    () => rootOf({ value: 'missing-root-primary' }),
    error => error instanceof JsonAstImport.JsonAstImportError
        && error.path === '$'
        && /Primary key "type" was not found/.test(error.message)
);
assert.throws(
    () => rootOf({ type: 'Root', child: { value: 'missing' } }, {
        classifyProperty({ key, automatic }) {
            return key === 'child' ? 'node' : automatic;
        },
    }),
    error => error instanceof JsonAstImport.JsonAstImportError
        && error.path === '$.child'
        && /Primary key "type" was not found/.test(error.message)
);

// Invalid explicit list contents report the exact item path.
assert.throws(
    () => rootOf({ type: 'Root', items: [{ type: 'A' }, 42] }, {
        classifyProperty({ key, automatic }) {
            return key === 'items' ? 'node-list' : automatic;
        },
    }),
    error => error.path === '$.items[1]' && /node-list item/.test(error.message)
);

// Pattern-string serialization keeps TreeMatchLib empty children as "_" so
// TreeConstruct can round-trip their position and child count.
{
    const root = new TestTree.NodeClass({ __A: 'Root' }, [
        new TestTree.NodeClass({ __A: 'A' }, []),
        null,
        new TestTree.NodeClass({ __A: 'B' }, []),
    ]);
    const tree = TestTree.newByRootNode(root);
    const pattern = JsonAstImport.treeToPatternString(tree, node => node.Attr0());
    const reconstructed = TreeConstruct(TestTree, pattern).Tree().GetRootNode();

    assert.match(pattern, /\(_\)/);
    assert.equal(reconstructed.NumChildren(), 3);
    assert.equal(reconstructed.NthChildNode(0).Attr0(), 'A');
    assert.equal(reconstructed.NthChildNode(1), null);
    assert.equal(reconstructed.NthChildNode(2).Attr0(), 'B');
}

console.log('json-ast-import tests: passed');
