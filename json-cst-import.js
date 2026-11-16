(function (globalScope) {
    'use strict';

    const DEFAULT_OPTIONS = Object.freeze({
        keys: Object.freeze({
            primary: 'name',
            secondary: 'value',
            children: 'child',
            attributes: 'attr',
        }),
        lookup: Object.freeze({
            primary: 'node-first',
            secondary: 'node-first',
            others: 'both',
        }),
    });

    class JsonCstImportError extends Error {
        constructor(message, path = '$') {
            super(`${message} (path: ${path})`);
            this.name = 'JsonCstImportError';
            this.path = path;
        }
    }

    function cloneOptions(options = DEFAULT_OPTIONS) {
        return {
            keys: {
                primary: options.keys?.primary ?? DEFAULT_OPTIONS.keys.primary,
                secondary: options.keys?.secondary ?? DEFAULT_OPTIONS.keys.secondary,
                children: options.keys?.children ?? DEFAULT_OPTIONS.keys.children,
                attributes: options.keys?.attributes ?? DEFAULT_OPTIONS.keys.attributes,
            },
            lookup: {
                primary: options.lookup?.primary ?? DEFAULT_OPTIONS.lookup.primary,
                secondary: options.lookup?.secondary ?? DEFAULT_OPTIONS.lookup.secondary,
                others: options.lookup?.others ?? DEFAULT_OPTIONS.lookup.others,
            },
        };
    }

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function hasOwn(object, key) {
        return Boolean(object && key && Object.prototype.hasOwnProperty.call(object, key));
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

    function childPath(parentPath, key) {
        if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parentPath}.${key}`;
        return `${parentPath}[${JSON.stringify(key)}]`;
    }

    function indexPath(parentPath, index) {
        return `${parentPath}[${index}]`;
    }

    function validateOptions(options) {
        const normalized = cloneOptions(options);
        const { keys, lookup } = normalized;

        for (const keyName of Object.keys(keys)) {
            if (typeof keys[keyName] !== 'string') {
                throw new JsonCstImportError(`The ${keyName} key setting must be a string`, '$options');
            }
            keys[keyName] = keys[keyName].trim();
        }

        if (!keys.primary) {
            throw new JsonCstImportError('The Primary key setting is required', '$options.keys.primary');
        }

        const nonEmptyKeys = Object.entries(keys).filter(([, value]) => value);
        const keyOwner = new Map();
        for (const [name, value] of nonEmptyKeys) {
            if (keyOwner.has(value)) {
                throw new JsonCstImportError(
                    `The ${name} key and ${keyOwner.get(value)} key cannot both be "${value}"`,
                    `$options.keys.${name}`
                );
            }
            keyOwner.set(value, name);
        }

        const primaryLookups = new Set(['node', 'attr', 'node-first']);
        const otherLookups = new Set(['node', 'attr', 'both']);
        if (!primaryLookups.has(lookup.primary)) {
            throw new JsonCstImportError('Invalid Primary lookup setting', '$options.lookup.primary');
        }
        if (!primaryLookups.has(lookup.secondary)) {
            throw new JsonCstImportError('Invalid Secondary lookup setting', '$options.lookup.secondary');
        }
        if (!otherLookups.has(lookup.others)) {
            throw new JsonCstImportError('Invalid normal-attribute lookup setting', '$options.lookup.others');
        }
        if (lookup.primary === 'attr' && !keys.attributes) {
            throw new JsonCstImportError(
                'An Attributes key is required when Primary is read from Attr',
                '$options.keys.attributes'
            );
        }

        return normalized;
    }

    function parseJsonText(text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            const message = String(error?.message || error);
            const positionMatch = message.match(/position\s+(\d+)/i);
            let location = '';
            if (positionMatch) {
                const position = Number(positionMatch[1]);
                const before = text.slice(0, position);
                const line = before.split('\n').length;
                const lastNewline = before.lastIndexOf('\n');
                const column = position - lastNewline;
                location = ` at line ${line}, column ${column}`;
            }
            throw new JsonCstImportError(`Invalid JSON${location}: ${message}`, '$');
        }
    }

    function getAttributeObject(node, options, path) {
        const key = options.keys.attributes;
        if (!key || !hasOwn(node, key)) return null;
        const value = node[key];
        if (!isPlainObject(value)) {
            throw new JsonCstImportError(
                `"${key}" must be an object`,
                childPath(path, key)
            );
        }
        return value;
    }

    function readConfiguredValue(node, attrObject, key, lookup) {
        if (!key) return { found: false, value: undefined };
        if (lookup === 'node') {
            return hasOwn(node, key)
                ? { found: true, value: node[key] }
                : { found: false, value: undefined };
        }
        if (lookup === 'attr') {
            return hasOwn(attrObject, key)
                ? { found: true, value: attrObject[key] }
                : { found: false, value: undefined };
        }
        if (hasOwn(node, key)) return { found: true, value: node[key] };
        return hasOwn(attrObject, key)
            ? { found: true, value: attrObject[key] }
            : { found: false, value: undefined };
    }

    function normalizePrimaryValue(value, label, path) {
        const type = typeof value;
        if (value === null || (type !== 'string' && type !== 'number' && type !== 'boolean')) {
            throw new JsonCstImportError(
                `${label} must be a string, number, or boolean`,
                path
            );
        }
        const normalized = String(value);
        if (label === 'Primary' && normalized.length === 0) {
            throw new JsonCstImportError('Primary must not be an empty string', path);
        }
        return normalized;
    }

    function collectNormalAttributes(node, attrObject, options, path) {
        const { keys, lookup } = options;
        const excluded = new Set([
            keys.primary,
            keys.secondary,
            keys.children,
            keys.attributes,
        ].filter(Boolean));
        // __proto__ なども通常のJSONキーとして保持するため、
        // Object.prototype を持たない辞書に独自プロパティを定義する。
        const normalAttributes = createDictionary();

        if (lookup.others === 'attr' || lookup.others === 'both') {
            for (const [key, value] of Object.entries(attrObject || {})) {
                if (!excluded.has(key)) setOwn(normalAttributes, key, value);
            }
        }

        if (lookup.others === 'node' || lookup.others === 'both') {
            for (const [key, value] of Object.entries(node)) {
                if (!excluded.has(key)) setOwn(normalAttributes, key, value);
            }
        }

        for (const reservedKey of ['__A', '__B']) {
            if (Object.prototype.hasOwnProperty.call(normalAttributes, reservedKey)) {
                throw new JsonCstImportError(
                    `Normal attribute "${reservedKey}" conflicts with TreeMatchLib's internal primary attributes`,
                    childPath(path, reservedKey)
                );
            }
        }
        return normalAttributes;
    }

    function importNode(jsonNode, TreeClass, options, path) {
        if (!isPlainObject(jsonNode)) {
            throw new JsonCstImportError('A CST node must be an object', path);
        }

        const attrObject = getAttributeObject(jsonNode, options, path);
        const primaryResult = readConfiguredValue(
            jsonNode,
            attrObject,
            options.keys.primary,
            options.lookup.primary
        );
        if (!primaryResult.found) {
            throw new JsonCstImportError(
                `Primary key "${options.keys.primary}" was not found using ${options.lookup.primary}`,
                path
            );
        }

        const primary = normalizePrimaryValue(primaryResult.value, 'Primary', path);
        const secondaryResult = readConfiguredValue(
            jsonNode,
            attrObject,
            options.keys.secondary,
            options.lookup.secondary
        );
        const secondary = secondaryResult.found && secondaryResult.value !== null
            ? normalizePrimaryValue(secondaryResult.value, 'Secondary', path)
            : null;

        const children = [];
        const childrenKey = options.keys.children;
        if (childrenKey && hasOwn(jsonNode, childrenKey)) {
            const sourceChildren = jsonNode[childrenKey];
            const childrenPath = childPath(path, childrenKey);
            if (!Array.isArray(sourceChildren)) {
                throw new JsonCstImportError(`"${childrenKey}" must be an array`, childrenPath);
            }
            for (let index = 0; index < sourceChildren.length; index++) {
                children.push(importNode(
                    sourceChildren[index],
                    TreeClass,
                    options,
                    indexPath(childrenPath, index)
                ));
            }
        }

        const normalAttributes = collectNormalAttributes(jsonNode, attrObject, options, path);
        const emptyNode = new TreeClass.NodeClass({}, []);
        const primaryKey0 = emptyNode.GetPrimaryAttributeKey0();
        const primaryKey1 = emptyNode.GetPrimaryAttributeKey1();
        const treeAttributes = createDictionary();
        for (const [key, value] of Object.entries(normalAttributes)) {
            setOwn(treeAttributes, key, value);
        }
        setOwn(treeAttributes, primaryKey0, primary);
        if (secondary !== null) setOwn(treeAttributes, primaryKey1, secondary);

        return new TreeClass.NodeClass(treeAttributes, children);
    }

    function importJsonSyntaxTree(jsonValue, TreeClass, rawOptions = DEFAULT_OPTIONS) {
        if (!TreeClass?.NodeClass || !TreeClass?.BoxClass) {
            throw new JsonCstImportError('A TreeMatchLib TreeClass is required', '$options');
        }
        const options = validateOptions(rawOptions);
        const rootNode = importNode(jsonValue, TreeClass, options, '$');
        return new TreeClass(new TreeClass.BoxClass(rootNode));
    }

    function generateSample(rawOptions = DEFAULT_OPTIONS) {
        const options = validateOptions(rawOptions);
        const { keys, lookup } = options;
        const configuredKeys = new Set(Object.values(keys).filter(Boolean));
        let normalKey = 'role';
        while (configuredKeys.has(normalKey)) normalKey = `_${normalKey}`;

        function makeSampleNode(primary, secondary, normalValue, children) {
            const node = createDictionary();
            let attrObject = null;
            const ensureAttr = () => {
                if (!attrObject) attrObject = createDictionary();
                return attrObject;
            };

            if (lookup.primary === 'attr') setOwn(ensureAttr(), keys.primary, primary);
            else setOwn(node, keys.primary, primary);

            if (keys.secondary) {
                if (lookup.secondary === 'attr') {
                    if (keys.attributes) setOwn(ensureAttr(), keys.secondary, secondary);
                } else {
                    setOwn(node, keys.secondary, secondary);
                }
            }

            if (lookup.others === 'node' || lookup.others === 'both') {
                setOwn(node, normalKey, normalValue);
            }
            if ((lookup.others === 'attr' || lookup.others === 'both') && keys.attributes) {
                setOwn(
                    ensureAttr(),
                    normalKey,
                    lookup.others === 'both' ? 'attr-value' : normalValue
                );
            }

            if (attrObject && keys.attributes) setOwn(node, keys.attributes, attrObject);
            if (keys.children) setOwn(node, keys.children, children);
            return node;
        }

        const leaf = makeSampleNode('Identifier', 'x', 'leaf', []);
        const root = makeSampleNode('Expression', 'sample', 'root', [leaf]);
        return JSON.stringify(root, null, 2);
    }

    const api = {
        DEFAULT_OPTIONS,
        JsonCstImportError,
        cloneOptions,
        validateOptions,
        parseJsonText,
        importJsonSyntaxTree,
        generateSample,
    };

    globalScope.JsonCstImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
