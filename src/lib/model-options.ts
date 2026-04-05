const DEFAULT_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-6',
  codex: 'gpt-5.4',
  gemini: '',
};

const SUGGESTED_MODELS: Record<string, string[]> = {
  claude: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  codex: ['gpt-5.4', 'gpt-5.4-mini', 'codex-5.3', 'codex-5.2'],
  gemini: [
    'gemini-3.1-pro-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-live',
    'gemini-3.1-pro-preview-0219',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
};

const LEGACY_GEMINI_MODELS = new Map([
  ['gemini-3.1-pro-preview', 'gemini-3.1-pro-latest'],
  ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
]);

export function getSuggestedModelsForCli(cli: string): string[] {
  return SUGGESTED_MODELS[cli] || [];
}

export function getDefaultModelForCli(cli: string): string {
  return DEFAULT_MODELS[cli] || '';
}

export function normalizeModelForCli(cli: string, model?: string): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) return undefined;

  if (cli !== 'gemini') return trimmed;
  if (LEGACY_GEMINI_MODELS.has(trimmed)) return LEGACY_GEMINI_MODELS.get(trimmed);

  return trimmed;
}

export function resolveModelForCli(cli: string, model?: string): string {
  return normalizeModelForCli(cli, model) || getDefaultModelForCli(cli);
}
