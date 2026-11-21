(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TargetImportState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STATUS = Object.freeze({
        UNIMPORTED: 'unimported',
        IMPORTED: 'imported',
        DIRTY: 'dirty',
        FAILED: 'failed',
    });

    function createState(settingsSignature = '') {
        return {
            input: '',
            settingsSignature,
            tree: null,
            metadata: null,
            importedInput: null,
            importedSettingsSignature: null,
            status: STATUS.UNIMPORTED,
            error: null,
        };
    }

    function recomputeStatus(state) {
        if (!state.tree) {
            state.status = STATUS.UNIMPORTED;
            return state.status;
        }
        state.status = state.input === state.importedInput
            && state.settingsSignature === state.importedSettingsSignature
            ? STATUS.IMPORTED
            : STATUS.DIRTY;
        return state.status;
    }

    class Store {
        constructor() {
            this.states = new Map();
        }

        ensure(key, settingsSignature = '') {
            if (!this.states.has(key)) {
                this.states.set(key, createState(settingsSignature));
            }
            return this.states.get(key);
        }

        setDraft(key, input, settingsSignature = '') {
            const state = this.ensure(key, settingsSignature);
            state.input = String(input ?? '');
            state.settingsSignature = settingsSignature;
            state.error = null;
            recomputeStatus(state);
            return state;
        }

        setSettings(key, settingsSignature) {
            const state = this.ensure(key, settingsSignature);
            state.settingsSignature = settingsSignature;
            state.error = null;
            recomputeStatus(state);
            return state;
        }

        markImported(key, { input, settingsSignature = '', tree, metadata = null }) {
            const state = this.ensure(key, settingsSignature);
            state.input = String(input ?? '');
            state.settingsSignature = settingsSignature;
            state.tree = tree;
            state.metadata = metadata;
            state.importedInput = state.input;
            state.importedSettingsSignature = settingsSignature;
            state.status = STATUS.IMPORTED;
            state.error = null;
            return state;
        }

        markFailed(key, { input, settingsSignature = '', error }) {
            const state = this.ensure(key, settingsSignature);
            state.input = String(input ?? '');
            state.settingsSignature = settingsSignature;
            state.status = STATUS.FAILED;
            state.error = error?.message || String(error);
            return state;
        }

        clear(key, settingsSignature = '') {
            const state = createState(settingsSignature);
            this.states.set(key, state);
            return state;
        }

        get(key, settingsSignature = '') {
            return this.ensure(key, settingsSignature);
        }
    }

    return {
        STATUS,
        Store,
        createState,
        recomputeStatus,
    };
});
