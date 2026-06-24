'use strict';

// ============================================================
// AST Import/Export Prototype
//
// 目的: config 駆動で JSON AST を中間表現に変換し、
//       元の JSON に round-trip できるか検証する。
// 実行: node ast_import_export_prototype.js
//
// 既存アプリ (app.js, index.html, style.css) には接続しない独立ファイル。
// TreeWrapperBase / TreeMatchLib / UI への組み込みは後工程。
// ============================================================

const assert = require('assert');

// ============================================================
// ESTree 用 config
// ============================================================

const estreeConfig = {
    nameKey: 'type',

    // 意味的な属性値として保持するキー (attrs に入る)
    attrKeys: [
        'name', 'value', 'raw', 'operator', 'kind', 'sourceType',
        'computed',  // MemberExpression: プロパティアクセスが [] か . か
        'optional',  // MemberExpression / CallExpression: オプショナルチェーン (?.) か否か
    ],

    // 単一子ノードキー → key wrapper (left/right などの区別を保持する)
    childKeys: [
        'left', 'right',
        'test', 'consequent', 'alternate',
        'id', 'expression', 'callee', 'argument',
        'init',             // VariableDeclarator の初期化式
        'object', 'property', // MemberExpression
    ],

    // 配列 or 単一ノードになるキー → 値の型で分岐
    // body は FunctionDeclaration では object、BlockStatement では array になる
    childListKeys: [
        'params', 'body', 'arguments',
        'declarations',     // VariableDeclaration の宣言リスト
    ],

    // 位置情報として meta に分けるキー (attrs に混ぜない)
    metaKeys: [
        'loc', 'range', 'start', 'end',
    ],

    // config 未登録キーへのデフォルト処理
    defaultObjectPolicy: 'attribute',
    defaultArrayPolicy:  'attribute',
};

// ============================================================
// importAST
// ============================================================

function importAST(jsonNode, config) {
    if (typeof jsonNode !== 'object' || jsonNode === null || Array.isArray(jsonNode)) {
        throw new Error(
            `importAST: expected a non-null plain object, ` +
            `got ${Array.isArray(jsonNode) ? 'array' : typeof jsonNode}`
        );
    }

    const {
        nameKey, attrKeys, metaKeys,
        childKeys, childListKeys,
        defaultObjectPolicy, defaultArrayPolicy,
    } = config;

    const name = jsonNode[nameKey];
    if (!name) {
        throw new Error(
            `importAST: missing or empty "${nameKey}" in: ${JSON.stringify(jsonNode).slice(0, 80)}`
        );
    }

    const attrs    = {};
    const meta     = {};
    const children = [];

    for (const key of Object.keys(jsonNode)) {
        if (key === nameKey) continue;

        const value = jsonNode[key];

        if (metaKeys.includes(key)) {
            // 位置情報 (loc, range など) は meta に保持
            meta[key] = value;

        } else if (attrKeys.includes(key)) {
            // 意味的な属性値 (name, operator など) は attrs に保持
            attrs[key] = value;

        } else if (childKeys.includes(key)) {
            // 単一子ノードキー: left, right, test, consequent, alternate, etc.
            if (value === null) {
                // null 値 (alternate:null など) → value:null で key wrapper を保持
                children.push({ kind: 'key', key, value: null });

            } else if (typeof value === 'object' && !Array.isArray(value) && value[nameKey]) {
                // nameKey を持つ object のみ子ノードとして import する
                children.push({ kind: 'key', key, children: [importAST(value, config)] });

            } else {
                // nameKey を持たない object、または object 以外の値 → warn + attrs
                console.warn(
                    `importAST: childKey "${key}" has ` +
                    (typeof value === 'object' && !Array.isArray(value)
                        ? `object without "${nameKey}"`
                        : `unexpected value type "${typeof value}"`) +
                    `, storing in attrs`
                );
                attrs[key] = value;
            }

        } else if (childListKeys.includes(key)) {
            // 配列/単一ノード兼用キー: params, body, arguments
            // 同じキー名でも値の型が異なるため (例: FunctionDeclaration.body は object、
            // BlockStatement.body は array) 型で分岐する
            if (value === null) {
                children.push({ kind: 'key', key, value: null });

            } else if (Array.isArray(value)) {
                // 配列 → list wrapper (空配列でも list を残す)
                const listChildren = value.map(item => importAST(item, config));
                children.push({
                    kind: 'key',
                    key,
                    children: [{ kind: 'list', children: listChildren }],
                });

            } else if (typeof value === 'object' && value !== null && value[nameKey]) {
                // nameKey を持つ object → 単一子ノード
                // 例: FunctionDeclaration.body は BlockStatement object
                children.push({ kind: 'key', key, children: [importAST(value, config)] });

            } else {
                console.warn(
                    `importAST: childListKey "${key}" has ` +
                    (typeof value === 'object'
                        ? `object without "${nameKey}"`
                        : `unexpected value type "${typeof value}"`) +
                    `, storing in attrs`
                );
                attrs[key] = value;
            }

        } else {
            // config 未登録キー — 型に応じてデフォルト処理
            if (value === null || typeof value !== 'object') {
                // primitive または null → attrs
                attrs[key] = value;

            } else if (Array.isArray(value)) {
                if (defaultArrayPolicy === 'attribute') {
                    if (value.some(item => item && typeof item === 'object' && item[nameKey])) {
                        console.warn(
                            `importAST: unknown array key "${key}" contains AST nodes, ` +
                            `treating as attribute per defaultArrayPolicy`
                        );
                    }
                    attrs[key] = value;
                }

            } else {
                if (defaultObjectPolicy === 'attribute') {
                    if (value[nameKey]) {
                        console.warn(
                            `importAST: unknown object key "${key}" has ` +
                            `"${nameKey}":"${value[nameKey]}", ` +
                            `treating as attribute per defaultObjectPolicy`
                        );
                    }
                    attrs[key] = value;
                }
            }
        }
    }

    return { kind: 'node', name, attrs, meta, children };
}

// ============================================================
// exportAST
// ============================================================

function exportAST(irNode, config) {
    if (!irNode || irNode.kind !== 'node') {
        throw new Error(`exportAST: expected kind:'node', got: "${irNode?.kind}"`);
    }
    if (!irNode.name) {
        throw new Error(`exportAST: node.name is missing`);
    }

    const { nameKey } = config;

    // nameKey + attrs + meta でベースオブジェクトを構成
    const result = {
        [nameKey]: irNode.name,
        ...irNode.attrs,
        ...irNode.meta,
    };

    // children の key wrapper を JSON キーに変換
    for (const child of irNode.children) {
        if (child.kind !== 'key') {
            throw new Error(
                `exportAST: node "${irNode.name}" has a non-key child (kind: "${child.kind}")`
            );
        }
        result[child.key] = exportKey(child, config);
    }

    return result;
}

function exportKey(keyNode, config) {
    // value:null の key wrapper → JSON 側でも null
    if ('value' in keyNode && keyNode.value === null) {
        return null;
    }

    const { children } = keyNode;

    if (!children || children.length === 0) {
        throw new Error(
            `exportAST: key "${keyNode.key}" has no children and value is not null`
        );
    }
    if (children.length > 1) {
        throw new Error(
            `exportAST: key "${keyNode.key}" has ${children.length} children (expected exactly 1)`
        );
    }

    const child = children[0];

    if (child.kind === 'node') {
        // 単一ノード → object として export
        return exportAST(child, config);
    } else if (child.kind === 'list') {
        // list wrapper → array として export
        return exportList(child, config);
    } else {
        throw new Error(
            `exportAST: key "${keyNode.key}" child has unexpected kind: "${child.kind}"`
        );
    }
}

function exportList(listNode, config) {
    if (!listNode || listNode.kind !== 'list') {
        throw new Error(`exportList: expected kind:'list', got: "${listNode?.kind}"`);
    }

    return listNode.children.map((child, i) => {
        if (child.kind !== 'node') {
            throw new Error(
                `exportList: list child[${i}] has unexpected kind: "${child.kind}" (expected 'node')`
            );
        }
        return exportAST(child, config);
    });
}

// ============================================================
// Round-trip helper
// ============================================================

function roundtrip(original, config) {
    return exportAST(importAST(original, config), config);
}

// ============================================================
// printTree — IR を [left]/node_list 形式でコンソール表示する
// ============================================================

function _irLabel(irNode) {
    if (irNode.kind === 'node') {
        const attrs = irNode.attrs || {};
        const displayVal = attrs.operator ?? attrs.name ?? attrs.value ?? attrs.kind;
        return displayVal !== undefined ? `${irNode.name}#${displayVal}` : irNode.name;
    }
    if (irNode.kind === 'key') {
        return ('value' in irNode && irNode.value === null)
            ? `[${irNode.key}] (null)`
            : `[${irNode.key}]`;
    }
    if (irNode.kind === 'list') {
        return 'node_list';
    }
    return `(unknown kind: ${irNode.kind})`;
}

function _irChildren(irNode) {
    if (irNode.kind === 'key' && 'value' in irNode && irNode.value === null) return [];
    return irNode.children || [];
}

function printTree(irNode, linePrefix = '', childPrefix = '') {
    console.log(linePrefix + _irLabel(irNode));
    const children = _irChildren(irNode);
    for (let i = 0; i < children.length; i++) {
        const last      = i === children.length - 1;
        const connector = last ? '└── ' : '├── ';
        const ext       = last ? '    ' : '│   ';
        printTree(children[i], childPrefix + connector, childPrefix + ext);
    }
}

// ============================================================
// Test runner
// ============================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        passed++;
    } catch (e) {
        console.log(`FAIL: ${name}`);
        console.log(`  ${e.message}`);
        failed++;
    }
}

// ============================================================
// Test cases
// ============================================================

function runRoundTripTests() {
    console.log('=== AST Import/Export Round-trip Tests ===\n');

    // 1. BinaryExpression: a + b
    test('BinaryExpression: a + b (left/right key wrappers, operator attr)', () => {
        const original = {
            type:     'BinaryExpression',
            operator: '+',
            left:     { type: 'Identifier', name: 'a' },
            right:    { type: 'Identifier', name: 'b' },
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 2. IfStatement with alternate block (includes empty arguments:[])
    test('IfStatement with alternate block (nested BlockStatement, empty arguments)', () => {
        const original = {
            type: 'IfStatement',
            test: {
                type:     'BinaryExpression',
                operator: '>',
                left:     { type: 'Identifier', name: 'x' },
                right:    { type: 'Literal',    value: 0, raw: '0' },
            },
            consequent: {
                type: 'BlockStatement',
                body: [{
                    type: 'ExpressionStatement',
                    expression: {
                        type:      'CallExpression',
                        callee:    { type: 'Identifier', name: 'doA' },
                        arguments: [],
                    },
                }],
            },
            alternate: {
                type: 'BlockStatement',
                body: [{
                    type: 'ExpressionStatement',
                    expression: {
                        type:      'CallExpression',
                        callee:    { type: 'Identifier', name: 'doB' },
                        arguments: [],
                    },
                }],
            },
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 3. IfStatement with alternate: null
    test('IfStatement with alternate: null (null key wrapper)', () => {
        const original = {
            type:       'IfStatement',
            test:       { type: 'Identifier', name: 'x' },
            consequent: { type: 'BlockStatement', body: [] },
            alternate:  null,
        };

        // 内部表現で alternate が { kind:'key', key:'alternate', value:null } になることを確認
        const ir = importAST(original, estreeConfig);
        const altKey = ir.children.find(c => c.kind === 'key' && c.key === 'alternate');
        assert.ok(altKey,                   'alternate key wrapper が存在すること');
        assert.strictEqual(altKey.value,    null, 'alternate key wrapper.value が null であること');
        assert.ok(!altKey.children,         'alternate key wrapper に children がないこと');

        // round-trip で alternate:null が復元されること
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 4. FunctionDeclaration (body の object/array 分岐を確認)
    test('FunctionDeclaration: function foo(a, b) { return a + b }', () => {
        const original = {
            type: 'FunctionDeclaration',
            id:     { type: 'Identifier', name: 'foo' },
            params: [
                { type: 'Identifier', name: 'a' },
                { type: 'Identifier', name: 'b' },
            ],
            body: {
                type: 'BlockStatement',
                body: [{
                    type: 'ReturnStatement',
                    argument: {
                        type:     'BinaryExpression',
                        operator: '+',
                        left:     { type: 'Identifier', name: 'a' },
                        right:    { type: 'Identifier', name: 'b' },
                    },
                }],
            },
        };

        // FunctionDeclaration.body は object → 単一 child になること
        const ir = importAST(original, estreeConfig);
        const bodyKey = ir.children.find(c => c.kind === 'key' && c.key === 'body');
        assert.ok(bodyKey,                                  'body key wrapper が存在すること');
        assert.strictEqual(bodyKey.children.length, 1,     'body key wrapper の children が1つであること');
        assert.strictEqual(bodyKey.children[0].kind, 'node', 'FunctionDeclaration.body が node として保持されること');
        assert.strictEqual(bodyKey.children[0].name, 'BlockStatement');

        // BlockStatement.body は array → list wrapper になること
        const blockBodyKey = bodyKey.children[0].children.find(c => c.kind === 'key' && c.key === 'body');
        assert.ok(blockBodyKey,                                     'BlockStatement の body key wrapper が存在すること');
        assert.strictEqual(blockBodyKey.children[0].kind, 'list',  'BlockStatement.body が list wrapper であること');

        // round-trip
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 5. CallExpression with arguments: []
    test('CallExpression with arguments: [] (空配列が消えずに復元される)', () => {
        const original = {
            type:      'CallExpression',
            callee:    { type: 'Identifier', name: 'foo' },
            arguments: [],
        };

        // 空配列でも list wrapper が残ること
        const ir = importAST(original, estreeConfig);
        const argsKey = ir.children.find(c => c.kind === 'key' && c.key === 'arguments');
        assert.ok(argsKey,                                   'arguments key wrapper が存在すること');
        assert.strictEqual(argsKey.children[0].kind, 'list', 'arguments が list wrapper であること');
        assert.strictEqual(argsKey.children[0].children.length, 0, '空 list であること');

        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 6. Identifier with range (metaKey)
    test('Identifier with range: [0, 1] (range は meta に入り node_list にならない)', () => {
        const original = {
            type:  'Identifier',
            name:  'a',
            range: [0, 1],
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 7. ConditionalExpression: a ? b : c
    test('ConditionalExpression: a ? b : c (test/consequent/alternate が childKeys)', () => {
        const original = {
            type:       'ConditionalExpression',
            test:       { type: 'Identifier', name: 'a' },
            consequent: { type: 'Identifier', name: 'b' },
            alternate:  { type: 'Identifier', name: 'c' },
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 8. Program > VariableDeclaration: const x = a + b;
    test('Program > VariableDeclaration: const x = a + b', () => {
        const original = {
            type:       'Program',
            sourceType: 'script',
            body: [{
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [{
                    type: 'VariableDeclarator',
                    id:   { type: 'Identifier', name: 'x' },
                    init: {
                        type:     'BinaryExpression',
                        operator: '+',
                        left:     { type: 'Identifier', name: 'a' },
                        right:    { type: 'Identifier', name: 'b' },
                    },
                }],
            }],
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 9. Program > ExpressionStatement > CallExpression: console.log("hello");
    test('Program > ExpressionStatement > CallExpression: console.log("hello")', () => {
        const original = {
            type:       'Program',
            sourceType: 'script',
            body: [{
                type: 'ExpressionStatement',
                expression: {
                    type: 'CallExpression',
                    callee: {
                        type:     'MemberExpression',
                        object:   { type: 'Identifier', name: 'console' },
                        property: { type: 'Identifier', name: 'log' },
                        computed: false,
                    },
                    arguments: [
                        { type: 'Literal', value: 'hello', raw: '"hello"' },
                    ],
                },
            }],
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // 10. 実パーサー出力に近い Program: const x = a + b; console.log("hello");
    //     start/end 位置情報付き、MemberExpression の computed/optional フラグ付き
    test('Program (real-ish ESTree): const x = a+b; console.log("hello"); with start/end', () => {
        const original = {
            type: 'Program', start: 0, end: 39, sourceType: 'script',
            body: [
                {
                    type: 'VariableDeclaration', start: 0, end: 17, kind: 'const',
                    declarations: [{
                        type: 'VariableDeclarator', start: 6, end: 16,
                        id:   { type: 'Identifier', start: 6,  end: 7,  name: 'x' },
                        init: {
                            type: 'BinaryExpression', start: 10, end: 15, operator: '+',
                            left:  { type: 'Identifier', start: 10, end: 11, name: 'a' },
                            right: { type: 'Identifier', start: 14, end: 15, name: 'b' },
                        },
                    }],
                },
                {
                    type: 'ExpressionStatement', start: 18, end: 39,
                    expression: {
                        type: 'CallExpression', start: 18, end: 38, optional: false,
                        callee: {
                            type: 'MemberExpression', start: 18, end: 29,
                            computed: false, optional: false,
                            object:   { type: 'Identifier', start: 18, end: 25, name: 'console' },
                            property: { type: 'Identifier', start: 26, end: 29, name: 'log' },
                        },
                        arguments: [
                            { type: 'Literal', start: 30, end: 37, value: 'hello', raw: '"hello"' },
                        ],
                    },
                },
            ],
        };
        assert.deepStrictEqual(roundtrip(original, estreeConfig), original);
    });

    // ---- Summary ----
    console.log('');
    if (failed === 0) {
        console.log(`All tests passed (${passed}/${passed + failed})`);
    } else {
        console.log(`${passed} passed, ${failed} failed`);
    }
}

runRoundTripTests();

// ============================================================
// printTree デモ
// ============================================================

console.log('\n=== printTree Demo ===\n');

// Demo 1: a + b
console.log('--- a + b ---');
printTree(importAST({
    type: 'BinaryExpression', operator: '+',
    left:  { type: 'Identifier', name: 'a' },
    right: { type: 'Identifier', name: 'b' },
}, estreeConfig));

// Demo 2: if (x) { doA() }  ← else なし (alternate: null)
console.log('\n--- if (x) { doA() } ---');
printTree(importAST({
    type: 'IfStatement',
    test:       { type: 'Identifier', name: 'x' },
    consequent: {
        type: 'BlockStatement',
        body: [{
            type: 'ExpressionStatement',
            expression: {
                type: 'CallExpression',
                callee:    { type: 'Identifier', name: 'doA' },
                arguments: [],
            },
        }],
    },
    alternate: null,
}, estreeConfig));

// Demo 3: const x = a + b;

console.log('\n--- const x = a + b; ---');
printTree(importAST({
    type: 'Program', sourceType: 'script',
    body: [{
        type: 'VariableDeclaration', kind: 'const',
        declarations: [{
            type: 'VariableDeclarator',
            id:   { type: 'Identifier', name: 'x' },
            init: {
                type: 'BinaryExpression', operator: '+',
                left:  { type: 'Identifier', name: 'a' },
                right: { type: 'Identifier', name: 'b' },
            },
        }],
    }],
}, estreeConfig));

// Demo 4: real-ish ESTree — const x = a + b; console.log("hello"); (start/end 付き)
console.log('\n--- [real-ish] const x = a+b; console.log("hello"); ---');
printTree(importAST({
    type: 'Program', start: 0, end: 39, sourceType: 'script',
    body: [
        {
            type: 'VariableDeclaration', start: 0, end: 17, kind: 'const',
            declarations: [{
                type: 'VariableDeclarator', start: 6, end: 16,
                id:   { type: 'Identifier', start: 6,  end: 7,  name: 'x' },
                init: {
                    type: 'BinaryExpression', start: 10, end: 15, operator: '+',
                    left:  { type: 'Identifier', start: 10, end: 11, name: 'a' },
                    right: { type: 'Identifier', start: 14, end: 15, name: 'b' },
                },
            }],
        },
        {
            type: 'ExpressionStatement', start: 18, end: 39,
            expression: {
                type: 'CallExpression', start: 18, end: 38, optional: false,
                callee: {
                    type: 'MemberExpression', start: 18, end: 29,
                    computed: false, optional: false,
                    object:   { type: 'Identifier', start: 18, end: 25, name: 'console' },
                    property: { type: 'Identifier', start: 26, end: 29, name: 'log' },
                },
                arguments: [
                    { type: 'Literal', start: 30, end: 37, value: 'hello', raw: '"hello"' },
                ],
            },
        },
    ],
}, estreeConfig));
