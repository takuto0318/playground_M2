'use strict';

const assert = require('node:assert/strict');
const TargetImportState = require('../target-import-state.js');

const { STATUS, Store } = TargetImportState;
const store = new Store();
const firstTree = { id: 'first' };
const secondTree = { id: 'second' };

assert.equal(store.get('json', 'settings-a').status, STATUS.UNIMPORTED);

store.setDraft('json', '{"type":"A"}', 'settings-a');
assert.equal(store.get('json').status, STATUS.UNIMPORTED);

store.markImported('json', {
    input: '{"type":"A"}',
    settingsSignature: 'settings-a',
    tree: firstTree,
    metadata: { source: 'json' },
});
assert.equal(store.get('json').status, STATUS.IMPORTED);
assert.equal(store.get('json').tree, firstTree);

store.setDraft('json', '{"type":"B"}', 'settings-a');
assert.equal(store.get('json').status, STATUS.DIRTY);
assert.equal(store.get('json').tree, firstTree);

store.setDraft('json', '{"type":"A"}', 'settings-a');
assert.equal(store.get('json').status, STATUS.IMPORTED);

store.setSettings('json', 'settings-b');
assert.equal(store.get('json').status, STATUS.DIRTY);
store.setSettings('json', 'settings-a');
assert.equal(store.get('json').status, STATUS.IMPORTED);

store.markFailed('json', {
    input: '{invalid}',
    settingsSignature: 'settings-a',
    error: new Error('invalid JSON'),
});
assert.equal(store.get('json').status, STATUS.FAILED);
assert.equal(store.get('json').error, 'invalid JSON');
assert.equal(store.get('json').tree, firstTree);

store.setDraft('json', '{"type":"A"}', 'settings-a');
assert.equal(store.get('json').status, STATUS.IMPORTED);
assert.equal(store.get('json').error, null);

const emptyFailure = store.markFailed('json-cst', {
    input: '{invalid}',
    settingsSignature: 'cst-settings',
    error: 'invalid CST JSON',
});
assert.equal(emptyFailure.status, STATUS.FAILED);
assert.equal(emptyFailure.tree, null);
assert.equal(emptyFailure.error, 'invalid CST JSON');

store.setDraft('json-cst', '{"name":"Root"}', 'cst-settings');
assert.equal(store.get('json-cst').status, STATUS.UNIMPORTED);
assert.equal(store.get('json-cst').error, null);

store.markImported('code:javascript', {
    input: 'const x = 1;',
    settingsSignature: 'javascript',
    tree: secondTree,
});
assert.equal(store.get('code:javascript').tree, secondTree);
assert.equal(store.get('json').tree, firstTree);

store.setDraft('code:c', 'int main(void) { return 0; }', 'c');
assert.equal(store.get('code:c').status, STATUS.UNIMPORTED);
assert.equal(store.get('code:javascript').status, STATUS.IMPORTED);

store.clear('json', 'settings-a');
assert.equal(store.get('json').status, STATUS.UNIMPORTED);
assert.equal(store.get('json').tree, null);
assert.equal(store.get('json').input, '');
assert.equal(store.get('code:javascript').tree, secondTree);

console.log('target import state tests: passed');
