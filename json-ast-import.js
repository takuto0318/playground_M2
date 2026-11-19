(function (globalScope) {
    'use strict';

    const DEFAULT_OPTIONS = Object.freeze({
        keys: Object.freeze({
            primary: 'type',
        }),
        secondaryCandidates: Object.freeze(['name', 'value', 'operator', 'kind']),
        fieldNodeName: '__Field',
        listFieldNodeName: '__ListField',
        classifyProperty: null,
    });
    const structuralNodeKinds = new WeakMap();

    class JsonAstImportError extends Error {
        constructor(message, path = '$') {
            super(`${message} (path: ${path})`);
            this.name = 'JsonAstImportError';
            this.path = path;
        }
    }

    function hasOwn(object, key) {
        return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function childPath(parentPath, key) {
        if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parentPath}.${key}`;
        return `${parentPath}[${JSON.stringify(key)}]`;
    }

    function indexPath(parentPath, index) {
        return `${parentPath}[${index}]`;
    }

    function createDictionary() {
        return Object.create(null);
    }

    function setOwn(object, key, value) {
        Object.defineProperty(object, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }

    function cloneOptions(rawOptions = DEFAULT_OPTIONS) {
        const rawKeys = rawOptions.keys || {};
        const secondaryWasSpecified = hasOwn(rawKeys, 'secondary');
        const keys = {
            primary: rawKeys.primary ?? DEFAULT_OPTIONS.keys.primary,
        };
        if (secondaryWasSpecified) keys.secondary = rawKeys.secondary;

        return {
            keys,
            secondaryCandidates: Array.isArray(rawOptions.secondaryCandidates)
                ? rawOptions.secondaryCandidates.slice()
                : DEFAULT_OPTIONS.secondaryCandidates.slice(),
            fieldNodeName: rawOptions.fieldNodeName ?? DEFAULT_OPTIONS.fieldNodeName,
            listFieldNodeName: rawOptions.listFieldNodeName ?? DEFAULT_OPTIONS.listFieldNodeName,
            classifyProperty: rawOptions.classifyProperty ?? DEFAULT_OPTIONS.classifyProperty,
        };
    }

    function validateOptions(rawOptions = DEFAULT_OPTIONS) {
        const options = cloneOptions(rawOptions);
        const primary = options.keys.primary;
        if (typeof primary !== 'string' || !primary.trim()) {
            throw new JsonAstImportError(
                'The Primary key setting must be a non-empty string',
                '$options.keys.primary'
            );
        }
        options.keys.primary = primary.trim();

        if (hasOwn(options.keys, 'secondary')) {
            if (options.keys.secondary === null) options.keys.secondary = '';
            if (typeof options.keys.secondary !== 'string') {
                throw new JsonAstImportError(
                    'The Secondary key setting must be a string',
                    '$options.keys.secondary'
                );
            }
            options.keys.secondary = options.keys.secondary.trim();
            if (options.keys.secondary
                && options.keys.secondary === options.keys.primary) {
                throw new JsonAstImportError(
                    'Primary and Secondary keys must be different',
                    '$options.keys.secondary'
                );
            }
        }

        if (!Array.isArray(options.secondaryCandidates)
            || options.secondaryCandidates.some(key => typeof key !== 'string')) {
            throw new JsonAstImportError(
                'Secondary candidates must be an array of strings',
                '$options.secondaryCandidates'
            );
        }
        options.secondaryCandidates = options.secondaryCandidates
            .map(key => key.trim())
            .filter(Boolean);

        for (const optionName of ['fieldNodeName', 'listFieldNodeName']) {
            if (typeof options[optionName] !== 'string' || !options[optionName].trim()) {
                throw new JsonAstImportError(
                    `${optionName} must be a non-empty string`,
                    `$options.${optionName}`
                );
            }
            options[optionName] = options[optionName].trim();
        }

        if (options.classifyProperty !== null
            && typeof options.classifyProperty !== 'function') {
            throw new JsonAstImportError(
                'classifyProperty must be a function or null',
                '$options.classifyProperty'
            );
        }
        return options;
    }

    function isNodeObject(value, primaryKey) {
        return isObject(value) && hasOwn(value, primaryKey);
    }

    function isNodeList(value, primaryKey) {
        return Array.isArray(value) && value.every(item => (
            item === null || item === undefined || isNodeObject(item, primaryKey)
        ));
    }

    function defaultClassifyProperty(value, options) {
        if (isNodeObject(value, options.keys.primary)) return 'node';
        if (isNodeList(value, options.keys.primary)) return 'node-list';
        return 'attribute';
    }

    function globToRegExp(pattern) {
        let source = '^';
        for (const character of pattern) {
            if (character === '*') {
                source += '.*';
            } else if (character === '?') {
                source += '.';
            } else {
                source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }
        return new RegExp(`${source}$`);
    }

    function compilePropertyRules(rawRules = []) {
        if (!Array.isArray(rawRules)) {
            throw new JsonAstImportError('Rules must be an array', '$options.rules');
        }

        return rawRules.map((rawRule, index) => {
            const rulePath = `$options.rules[${index}]`;
            const match = rawRule?.match;
            const pattern = rawRule?.pattern;
            const classification = rawRule?.classification;

            if (!['exact', 'glob', 'regex'].includes(match)) {
                throw new JsonAstImportError(
                    'Rule matching must be exact, glob, or regex',
                    `${rulePath}.match`
                );
            }
            if (typeof pattern !== 'string' || !pattern) {
                throw new JsonAstImportError(
                    'Rule pattern must be a non-empty string',
                    `${rulePath}.pattern`
                );
            }
            if (!['attribute', 'node', 'node-list', 'ignore'].includes(classification)) {
                throw new JsonAstImportError(
                    'Rule classification must be attribute, node, node-list, or ignore',
                    `${rulePath}.classification`
                );
            }

            let matches;
            if (match === 'exact') {
                matches = key => key === pattern;
            } else {
                let expression;
                try {
                    expression = match === 'glob'
                        ? globToRegExp(pattern)
                        : new RegExp(pattern);
                } catch (error) {
                    throw new JsonAstImportError(
                        `Invalid ${match} pattern: ${error.message}`,
                        `${rulePath}.pattern`
                    );
                }
                matches = key => expression.test(key);
            }

            return { matches, classification };
        });
    }

    function compileCustomFunction(source) {
        if (typeof source !== 'string' || !source.trim()) {
            throw new JsonAstImportError(
                'Custom function must not be empty',
                '$options.customFunction'
            );
        }

        let customFunction;
        try {
            customFunction = Function(`"use strict"; return (${source}\n);`)();
        } catch (error) {
            throw new JsonAstImportError(
                `Invalid custom function: ${error.message}`,
                '$options.customFunction'
            );
        }
        if (typeof customFunction !== 'function') {
            throw new JsonAstImportError(
                'Custom function source must evaluate to a function',
                '$options.customFunction'
            );
        }
        return customFunction;
    }

    function createPropertyClassifier(rawConfig = {}) {
        const method = rawConfig.method || 'auto-rules';
        if (!['auto-rules', 'rules-only', 'custom'].includes(method)) {
            throw new JsonAstImportError(
                'Detection method must be auto-rules, rules-only, or custom',
                '$options.method'
            );
        }

        if (method === 'custom') {
            const customFunction = compileCustomFunction(rawConfig.customFunction || '');
            return ({ node, key }) => {
                const result = customFunction(node, key);
                if (!['attribute', 'node', 'node-list', 'ignore'].includes(result)) {
                    throw new Error(
                        'Custom function must return attribute, node, node-list, or ignore'
                    );
                }
                return result;
            };
        }

        const rules = compilePropertyRules(rawConfig.rules || []);
        const unmatched = rawConfig.unmatched || 'attribute';
        if (!['attribute', 'ignore'].includes(unmatched)) {
            throw new JsonAstImportError(
                'Unmatched must be attribute or ignore',
                '$options.unmatched'
            );
        }

        return ({ key }) => {
            for (const rule of rules) {
                if (rule.matches(key)) return rule.classification;
            }
            return method === 'auto-rules' ? 'auto' : unmatched;
        };
    }

    function classifyProperty(node, key, value, options, path) {
        const automatic = defaultClassifyProperty(value, options);
        if (!options.classifyProperty) return automatic;

        let result;
        try {
            result = options.classifyProperty({
                node,
                key,
                value,
                path,
                automatic,
            });
        } catch (error) {
            if (error instanceof JsonAstImportError) throw error;
            throw new JsonAstImportError(
                `Property classifier failed: ${error?.message || String(error)}`,
                path
            );
        }
        if (result === undefined || result === null || result === 'auto') return automatic;
        if (!['node', 'node-list', 'attribute', 'ignore'].includes(result)) {
            throw new JsonAstImportError(
                'Property classifier must return node, node-list, attribute, ignore, or auto',
                path
            );
        }
        return result;
    }

    function normalizePrimary(value, path) {
        const type = typeof value;
        if (value === null || value === undefined
            || (type !== 'string' && type !== 'number' && type !== 'boolean')) {
            throw new JsonAstImportError(
                'Primary must be a string, number, or boolean',
                path
            );
        }
        const normalized = String(value);
        if (!normalized) throw new JsonAstImportError('Primary must not be empty', path);
        return normalized;
    }

    function selectSecondary(node, options) {
        if (hasOwn(options.keys, 'secondary')) {
            const key = options.keys.secondary;
            if (!key) {
                return { key: null, value: null };
            }
            if (!hasOwn(node, key) || node[key] === null || node[key] === undefined) {
                return { key, value: null };
            }
            return { key, value: String(node[key]) };
        }

        for (const key of options.secondaryCandidates) {
            if (key === options.keys.primary) continue;
            if (!hasOwn(node, key) || node[key] === null || node[key] === undefined) continue;
            if (defaultClassifyProperty(node[key], options) !== 'attribute') continue;
            return { key, value: String(node[key]) };
        }
        return { key: null, value: null };
    }

    function treeToPatternString(tree, formatNode) {
        if (!tree?.GetRootNode || typeof formatNode !== 'function') {
            throw new Error('treeToPatternString requires a tree and a node formatter.');
        }

        function nodeToString(node, depth = 0) {
            if (!node) return '_';

            let result = formatNode(node);
            const childCount = node.NumChildren();
            if (childCount === 0) return result;

            const children = [];
            for (let index = 0; index < childCount; index++) {
                children.push(nodeToString(node.NthChildNode(index), depth + 1));
            }

            const indent = '  '.repeat(depth + 1);
            if (children.length === 1) return `${result} > ${children[0]}`;
            return result + ' >\n' + indent
                + '(' + children.join(')\n' + indent + '(') + ')';
        }

        return nodeToString(tree.GetRootNode());
    }

    function createTreeAttributes(TreeClass, primary, secondary, normalAttributes, path) {
        const probe = new TreeClass.NodeClass({}, []);
        const primaryKey0 = probe.GetPrimaryAttributeKey0();
        const primaryKey1 = probe.GetPrimaryAttributeKey1();
        const attributes = createDictionary();

        for (const [key, value] of Object.entries(normalAttributes)) {
            if (key === primaryKey0 || key === primaryKey1) {
                throw new JsonAstImportError(
                    `Normal attribute "${key}" conflicts with TreeMatchLib's primary attributes`,
                    childPath(path, key)
                );
            }
            setOwn(attributes, key, value);
        }
        setOwn(attributes, primaryKey0, primary);
        if (secondary !== null) setOwn(attributes, primaryKey1, secondary);
        return attributes;
    }

    function makeStructuralNode(TreeClass, primary, secondary, children, kind) {
        const attributes = createTreeAttributes(
            TreeClass,
            primary,
            secondary,
            createDictionary(),
            '$structural'
        );
        const node = new TreeClass.NodeClass(attributes, children);
        structuralNodeKinds.set(node, kind);
        return node;
    }

    function getStructuralNodeKind(node) {
        return node && typeof node === 'object'
            ? structuralNodeKinds.get(node) || null
            : null;
    }

    function isStructuralNode(node) {
        return getStructuralNodeKind(node) !== null;
    }

    function importNode(jsonNode, TreeClass, options, path) {
        if (!isObject(jsonNode)) {
            throw new JsonAstImportError('An AST node must be an object', path);
        }

        const primaryKey = options.keys.primary;
        if (!hasOwn(jsonNode, primaryKey)) {
            throw new JsonAstImportError(`Primary key "${primaryKey}" was not found`, path);
        }
        const primary = normalizePrimary(jsonNode[primaryKey], childPath(path, primaryKey));
        const secondary = selectSecondary(jsonNode, options);
        const normalAttributes = createDictionary();
        const children = [];

        for (const [key, value] of Object.entries(jsonNode)) {
            if (key === primaryKey || key === secondary.key) continue;

            const propertyPath = childPath(path, key);
            const kind = classifyProperty(jsonNode, key, value, options, propertyPath);
            if (kind === 'ignore') continue;

            if (kind === 'attribute') {
                setOwn(normalAttributes, key, value);
                continue;
            }

            if (kind === 'node') {
                let child = null;
                if (value !== null && value !== undefined) {
                    if (!isObject(value)) {
                        throw new JsonAstImportError(
                            'A node property must be null, undefined, or an object',
                            propertyPath
                        );
                    }
                    child = importNode(value, TreeClass, options, propertyPath);
                }
                children.push(makeStructuralNode(
                    TreeClass,
                    options.fieldNodeName,
                    key,
                    [child],
                    'field'
                ));
                continue;
            }

            if (!Array.isArray(value)) {
                throw new JsonAstImportError('A node-list property must be an array', propertyPath);
            }
            const listChildren = [];
            for (let index = 0; index < value.length; index++) {
                const item = value[index];
                if (item === null || item === undefined) {
                    listChildren.push(null);
                    continue;
                }
                if (!isObject(item)) {
                    throw new JsonAstImportError(
                        'A node-list item must be null, undefined, or an object',
                        indexPath(propertyPath, index)
                    );
                }
                listChildren.push(importNode(
                    item,
                    TreeClass,
                    options,
                    indexPath(propertyPath, index)
                ));
            }
            children.push(makeStructuralNode(
                TreeClass,
                options.listFieldNodeName,
                key,
                listChildren,
                'list-field'
            ));
        }

        const attributes = createTreeAttributes(
            TreeClass,
            primary,
            secondary.value,
            normalAttributes,
            path
        );
        return new TreeClass.NodeClass(attributes, children);
    }

    function importJsonAstNode(jsonNode, TreeClass, rawOptions = DEFAULT_OPTIONS) {
        if (!TreeClass?.NodeClass || !TreeClass?.BoxClass) {
            throw new JsonAstImportError('A TreeMatchLib TreeClass is required', '$options');
        }
        const options = validateOptions(rawOptions);
        return importNode(jsonNode, TreeClass, options, '$');
    }

    function importJsonAst(jsonNode, TreeClass, rawOptions = DEFAULT_OPTIONS) {
        const rootNode = importJsonAstNode(jsonNode, TreeClass, rawOptions);
        return new TreeClass(new TreeClass.BoxClass(rootNode));
    }

    const api = {
        DEFAULT_OPTIONS,
        JsonAstImportError,
        cloneOptions,
        validateOptions,
        isNodeObject,
        isNodeList,
        defaultClassifyProperty,
        createPropertyClassifier,
        classifyProperty,
        getStructuralNodeKind,
        isStructuralNode,
        treeToPatternString,
        importJsonAstNode,
        importJsonAst,
    };

    globalScope.JsonAstImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
