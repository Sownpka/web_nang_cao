import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@judgehint/shared';

export const CODE_TEMPLATES: Record<Language, string> = {
  python: `import sys


def main():
    data = sys.stdin.read().split()
    # Viết lời giải của bạn ở đây


if __name__ == "__main__":
    main()
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);

// Viết lời giải của bạn ở đây
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Viết lời giải của bạn ở đây
    return 0;
}
`,
};

// localStorage can throw (private mode, quota); drafts are a convenience, so fail quietly.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const draftKey = (problemId: string, lang: Language) => `jh:draft:${problemId}:${lang}`;
const langKey = (problemId: string) => `jh:lang:${problemId}`;

/** Code editor state persisted per problem and language. */
export function useCodeDraft(problemId: string, allowed: Language[]) {
  const pickLanguage = (): Language => {
    const saved = read(langKey(problemId)) as Language | null;
    return saved && allowed.includes(saved) ? saved : (allowed[0] ?? 'python');
  };

  const [language, setLanguageState] = useState<Language>(pickLanguage);
  const [code, setCodeState] = useState(() => read(draftKey(problemId, language)) ?? CODE_TEMPLATES[language]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const setCode = useCallback(
    (next: string) => {
      setCodeState(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => write(draftKey(problemId, language), next), 400);
    },
    [problemId, language],
  );

  const setLanguage = useCallback(
    (next: Language) => {
      clearTimeout(saveTimer.current);
      write(draftKey(problemId, language), code);
      write(langKey(problemId), next);
      setLanguageState(next);
      setCodeState(read(draftKey(problemId, next)) ?? CODE_TEMPLATES[next]);
    },
    [problemId, language, code],
  );

  const reset = useCallback(() => {
    remove(draftKey(problemId, language));
    setCodeState(CODE_TEMPLATES[language]);
  }, [problemId, language]);

  return { language, setLanguage, code, setCode, reset };
}
