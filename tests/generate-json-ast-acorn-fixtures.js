'use strict';

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const fixtureDir = path.join(__dirname, 'fixtures', 'json-ast-acorn');
const parseOptions = {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
};

function createLargeSource(functionCount = 40) {
    const functions = [];
    const calls = [];

    for (let index = 0; index < functionCount; index++) {
        const suffix = String(index).padStart(2, '0');
        functions.push(`function lesson${suffix}(input) {
    const adjusted = input + ${index};
    if (adjusted >= ${index}) {
        print(adjusted);
    } else {
        print(0);
    }
    return helper.method("lesson-${suffix}", adjusted);
}`);
        calls.push(`lesson${suffix}(${index})`);
    }

    return `${functions.join('\n\n')}\n\nconst results = [\n    ${calls.join(',\n    ')}\n];\n`;
}

const fixtures = [
    {
        name: '01-basic-variable',
        description: 'Basic variable declaration',
        source: 'const x = 1;\n',
    },
    {
        name: '02-property-value',
        description: 'Object Property.value is an AST child node',
        source: 'const obj = { x: y };\n',
    },
    {
        name: '03-array-hole',
        description: 'ArrayExpression with an empty element',
        source: 'const xs = [a, , b];\n',
    },
    {
        name: '04-if-call',
        description: 'Conditional branches and function calls',
        source: `if (score >= 60) {
    print(score);
} else {
    print(0);
}
`,
    },
    {
        name: '05-function-calls',
        description: 'Function declaration, parameters, and method call',
        source: `function demo(x) {
    show(x);
    obj.method("ok", x);
}
`,
    },
    {
        name: '06-large-generated',
        description: 'Large reproducible input for Tree View scrolling',
        source: createLargeSource(),
    },
];

fs.mkdirSync(fixtureDir, { recursive: true });

const manifest = {
    parser: {
        name: 'acorn',
        version: acorn.version,
        options: parseOptions,
    },
    regenerationCommand: 'node tests/generate-json-ast-acorn-fixtures.js',
    fixtures: [],
};

for (const fixture of fixtures) {
    const sourceFile = `${fixture.name}.js`;
    const astFile = `${fixture.name}.json`;
    const ast = acorn.parse(fixture.source, parseOptions);

    fs.writeFileSync(path.join(fixtureDir, sourceFile), fixture.source, 'utf8');
    fs.writeFileSync(
        path.join(fixtureDir, astFile),
        `${JSON.stringify(ast, null, 2)}\n`,
        'utf8'
    );
    manifest.fixtures.push({
        name: fixture.name,
        description: fixture.description,
        sourceFile,
        astFile,
    });
}

fs.writeFileSync(
    path.join(fixtureDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
);

console.log(
    `Generated ${fixtures.length} Acorn ${acorn.version} JSON AST fixtures in ${fixtureDir}`
);
