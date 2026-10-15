import Editor from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import type { Language } from '@judgehint/shared';
import { useIsDark } from '@/hooks/useIsDark';
import '@/lib/monaco';

interface Props {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
}

/** Monaco editor themed to match the app. Import lazily — it pulls in Monaco. */
export default function CodeEditor({ language, value, onChange, readOnly, height = '100%' }: Props) {
  const dark = useIsDark();
  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      theme={dark ? 'judgehint-dark' : 'judgehint-light'}
      loading={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
      options={{
        readOnly,
        fontSize: 14,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontLigatures: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 4,
        automaticLayout: true,
        padding: { top: 12 },
        renderLineHighlight: 'line',
        // No language service is loaded, so word-based suggestions only.
        quickSuggestions: false,
        wordBasedSuggestions: 'currentDocument',
      }}
    />
  );
}
