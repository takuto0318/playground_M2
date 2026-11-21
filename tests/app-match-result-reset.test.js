'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = appSource.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist in app.js`);

    const bodyStart = appSource.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < appSource.length; i++) {
        if (appSource[i] === '{') depth++;
        if (appSource[i] === '}') depth--;
        if (depth === 0) return appSource.slice(start, i + 1);
    }
    throw new Error(`Could not extract ${name} from app.js`);
}

const clearFunctionSource = extractFunction('clearMatchResultState');
const context = {
    lastMatchResult: { copy: true },
    window: {
        lastMatchedResult: { single: true },
        lastMatchedResults: [{ multiple: true }],
        lastMatchedPattern: 'A > B',
    },
};

vm.runInNewContext(`${clearFunctionSource}\nclearMatchResultState();`, context);
assert.equal(context.lastMatchResult, null);
assert.equal(context.window.lastMatchedResult, null);
assert.equal(context.window.lastMatchedResults, null);
assert.equal(context.window.lastMatchedPattern, null);

const executeMatchSource = extractFunction('executeMatch');
assert.ok(
    executeMatchSource.match(/clearMatchResultState\(\)/g)?.length >= 2,
    'executeMatch must clear copy and display results for no target and empty pattern'
);

const clearImportSource = extractFunction('clearCurrentImportTarget');
assert.match(
    clearImportSource,
    /clearMatchResultState\(\)/,
    'Clear must explicitly reset the copy result as well as displayed match results'
);

const failedImportSource = extractFunction('failCurrentImport');
assert.doesNotMatch(
    failedImportSource,
    /clearMatchResultState\(\)/,
    'A failed import with a previous tree must preserve its previous match result'
);

const inputChangeSource = extractFunction('handleInputChange');
assert.doesNotMatch(
    inputChangeSource,
    /clearMatchResultState\(\)/,
    'Editing an import draft must preserve the previous imported tree result'
);

console.log('app match result reset tests: passed');
