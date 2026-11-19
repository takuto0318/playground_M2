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

// Settings use the same trimmed names for conversion, persistence, summaries,
// and sample generation. Whitespace inside a key remains significant.
{
    const normalized = JsonAstImport.validateOptions({
        keys: {
            primary: '  node kind  ',
            secondary: '  display label  ',
        },
        fieldNodeName: '  Field Slot  ',
        listFieldNodeName: '  List Slot  ',
    });
    assert.equal(normalized.keys.primary, 'node kind');
    assert.equal(normalized.keys.secondary, 'display label');
    assert.equal(normalized.fieldNodeName, 'Field Slot');
    assert.equal(normalized.listFieldNodeName, 'List Slot');

    const root = rootOf({
        'node kind': 'Leaf',
        'display label': 'x',
    }, normalized);
    assert.equal(root.Attr0(), 'Leaf');
    assert.equal(root.Attr1(), 'x');
}

// Options UI sequence: Auto -> Key -> None -> Auto, followed by custom
// Primary/Secondary keys. These are the exact option objects passed by the UI.
{
    const input = { type: 'Identifier', name: 'x', label: 'y' };
    assert.equal(rootOf(input).Attr1(), 'x');
    assert.equal(rootOf(input, {
        keys: { primary: 'type', secondary: 'label' },
    }).Attr1(), 'y');
    assert.equal(rootOf(input, {
        keys: { primary: 'type', secondary: '' },
    }).Attr1(), null);
    assert.equal(rootOf(input).Attr1(), 'x');

    const configured = rootOf({ kind: 'Leaf', label: 'z' }, {
        keys: { primary: 'kind', secondary: 'label' },
    });
    assert.equal(configured.Attr0(), 'Leaf');
    assert.equal(configured.Attr1(), 'z');
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

// Detection methods classify the same properties through rules, automatic
// detection, or a user function without changing conversion semantics.
{
    const input = {
        type: 'Root',
        child: { type: 'Leaf' },
        items: [{ type: 'A' }, null, { type: 'B' }],
        ignoredMeta: 1,
        count: 3,
    };
    const autoRules = rootOf(input, {
        classifyProperty: JsonAstImport.createPropertyClassifier({
            method: 'auto-rules',
            rules: [{
                match: 'regex',
                pattern: '^ignored',
                classification: 'ignore',
            }],
        }),
    });
    assert.equal(childByField(autoRules, 'child').Attr0(), '__Field');
    assert.equal(childByField(autoRules, 'items').NthChildNode(1), null);
    assert.equal(autoRules.GetAttribute('ignoredMeta'), null);
    assert.equal(autoRules.GetAttribute('count'), 3);

    const rulesOnly = rootOf(input, {
        classifyProperty: JsonAstImport.createPropertyClassifier({
            method: 'rules-only',
            unmatched: 'ignore',
            rules: [
                { match: 'exact', pattern: 'child', classification: 'node' },
                { match: 'glob', pattern: 'item*', classification: 'node-list' },
                { match: 'exact', pattern: 'count', classification: 'attribute' },
            ],
        }),
    });
    assert.equal(childByField(rulesOnly, 'child').Attr0(), '__Field');
    assert.equal(childByField(rulesOnly, 'items').NthChildNode(1), null);
    assert.equal(rulesOnly.GetAttribute('count'), 3);
    assert.equal(rulesOnly.GetAttribute('ignoredMeta'), null);

    const custom = rootOf(input, {
        classifyProperty: JsonAstImport.createPropertyClassifier({
            method: 'custom',
            customFunction: `(node, key) => {
                if (key === 'child') return 'node';
                if (key === 'items') return 'node-list';
                if (key === 'ignoredMeta') return 'ignore';
                return 'attribute';
            }`,
        }),
    });
    assert.equal(childByField(custom, 'child').Attr0(), '__Field');
    assert.equal(childByField(custom, 'items').NthChildNode(1), null);
    assert.equal(custom.GetAttribute('count'), 3);
    assert.equal(custom.GetAttribute('ignoredMeta'), null);
}

// The first matching rule wins, and structural node names are configurable.
{
    const root = rootOf({
        type: 'Root',
        item: { type: 'Leaf' },
        items: [{ type: 'A' }],
    }, {
        fieldNodeName: 'FieldSlot',
        listFieldNodeName: 'ListSlot',
        classifyProperty: JsonAstImport.createPropertyClassifier({
            method: 'auto-rules',
            rules: [
                { match: 'exact', pattern: 'item', classification: 'node' },
                { match: 'glob', pattern: 'item*', classification: 'ignore' },
            ],
        }),
    });
    assert.equal(childByField(root, 'item').Attr0(), 'FieldSlot');
    assert.equal(childByField(root, 'items'), undefined);
}

// A custom structural-node name may be identical to a real AST node type.
// Structural wrappers are identified by node identity, not by their name, so
// an Identifier from Code/CST/TreeConstruct is not affected by AST settings.
{
    const root = rootOf({
        type: 'Root',
        child: { type: 'Identifier', name: 'x' },
        children: [{ type: 'Identifier', name: 'y' }],
    }, {
        fieldNodeName: 'Identifier',
        listFieldNodeName: 'Identifier',
    });
    const field = childByField(root, 'child');
    const listField = childByField(root, 'children');
    const fieldValue = field.NthChildNode(0);
    const listValue = listField.NthChildNode(0);

    assert.equal(field.Attr0(), 'Identifier');
    assert.equal(fieldValue.Attr0(), 'Identifier');
    assert.equal(JsonAstImport.getStructuralNodeKind(field), 'field');
    assert.equal(JsonAstImport.getStructuralNodeKind(listField), 'list-field');
    assert.equal(JsonAstImport.isStructuralNode(fieldValue), false);
    assert.equal(JsonAstImport.isStructuralNode(listValue), false);

    const ordinaryIdentifier = TreeConstruct(TestTree, 'Identifier#x').Node();
    assert.equal(JsonAstImport.isStructuralNode(ordinaryIdentifier), false);
}

// Invalid settings fail before conversion. Runtime classifier failures retain
// the property path, as do invalid values forced into a node-list.
assert.throws(
    () => JsonAstImport.createPropertyClassifier({
        method: 'auto-rules',
        rules: [{ match: 'regex', pattern: '[', classification: 'node' }],
    }),
    error => error.path === '$options.rules[0].pattern' && /Invalid regex/.test(error.message)
);
assert.throws(
    () => JsonAstImport.createPropertyClassifier({
        method: 'custom',
        customFunction: '(node, key) => {',
    }),
    error => error.path === '$options.customFunction' && /Invalid custom function/.test(error.message)
);
assert.throws(
    () => rootOf({ type: 'Root', items: [] }, {
        classifyProperty: JsonAstImport.createPropertyClassifier({
            method: 'custom',
            customFunction: `(node, key) => {
                if (key === 'items') throw new Error('test failure');
                return 'attribute';
            }`,
        }),
    }),
    error => error.path === '$.items'
        && /test failure/.test(error.message)
        && /\(path: \$\.items\)/.test(error.message)
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
