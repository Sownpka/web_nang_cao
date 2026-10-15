// Self-hosted Monaco: editor core plus syntax highlighting for the judge languages only.
// Loaded lazily with the editor so the problem list stays light.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

monaco.editor.defineTheme('judgehint-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#16191f',
    'editor.lineHighlightBackground': '#1f232b',
    'editorGutter.background': '#16191f',
  },
});

monaco.editor.defineTheme('judgehint-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#ffffff' },
});

loader.config({ monaco });

export { monaco };
