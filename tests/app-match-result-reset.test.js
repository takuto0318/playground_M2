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

const statusPresentationSource = extractFunction('importStatusPresentation');
const statusContext = {
    TargetImportState: {
        STATUS: {
            IMPORTED: 'imported',
            DIRTY: 'dirty',
            FAILED: 'failed',
        },
    },
};
vm.runInNewContext(`
    ${statusPresentationSource}
    importedPresentation = importStatusPresentation({ status: 'imported' });
    dirtyPresentation = importStatusPresentation({ status: 'dirty', tree: {} });
    failedPresentation = importStatusPresentation({
        status: 'failed',
        tree: {},
        error: '$.items[1] is invalid'
    });
    emptyFailedPresentation = importStatusPresentation({
        status: 'failed',
        tree: null,
        error: 'invalid JSON'
    });
    unimportedPresentation = importStatusPresentation({ status: 'unimported' });
`, statusContext);
assert.equal(statusContext.importedPresentation.label, '取り込み済み');
assert.equal(statusContext.importedPresentation.output, null);
assert.equal(statusContext.dirtyPresentation.label, '変更あり・再取り込みが必要');
assert.match(statusContext.dirtyPresentation.output, /最後に正常に取り込んだ木/);
assert.equal(statusContext.failedPresentation.label, '取り込み失敗');
assert.match(statusContext.failedPresentation.output, /\$\.items\[1\] is invalid/);
assert.match(statusContext.failedPresentation.output, /前回成功時の木を表示/);
assert.match(statusContext.emptyFailedPresentation.output, /表示できる取り込み済みの木はありません/);
assert.equal(statusContext.unimportedPresentation.label, '未取り込み');

const helpTextSource = extractFunction('targetSourceHelpText');
const helpContext = {
    TARGET_SOURCE_HELP: {
        treeconstruct: 'TreeConstruct help',
    },
};
vm.runInNewContext(`
    ${helpTextSource}
    treeHelp = targetSourceHelpText('treeconstruct', 'javascript');
    jsHelp = targetSourceHelpText('code', 'javascript');
    cHelp = targetSourceHelpText('code', 'c');
    jsonHelp = targetSourceHelpText('json', 'javascript');
    cstHelp = targetSourceHelpText('json-cst', 'javascript');
    pythonHelp = targetSourceHelpText('code', 'python');
`, helpContext);
assert.equal(helpContext.treeHelp, 'TreeConstruct help');
assert.equal(helpContext.jsHelp, '');
assert.equal(helpContext.cHelp, '');
assert.equal(helpContext.jsonHelp, '');
assert.equal(helpContext.cstHelp, '');
assert.match(helpContext.pythonHelp, /not implemented yet/);

console.log('app match result reset tests: passed');
