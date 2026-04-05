import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDefaultModelForCli,
  getSuggestedModelsForCli,
  normalizeModelForCli,
  resolveModelForCli,
} from '../src/lib/model-options.ts';

test('maps stale Gemini 3.1 preview model names to current 3.1 labels', () => {
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-flash-lite-preview'), 'gemini-3.1-flash-lite');
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-pro-preview'), 'gemini-3.1-pro-latest');
});

test('preserves explicit Gemini model ids', () => {
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-pro-latest'), 'gemini-3.1-pro-latest');
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-flash-live'), 'gemini-3.1-flash-live');
  assert.equal(normalizeModelForCli('gemini', 'gemini-3.1-pro-preview-0219'), 'gemini-3.1-pro-preview-0219');
  assert.equal(normalizeModelForCli('gemini', 'gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeModelForCli('gemini', 'gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite');
  assert.equal(normalizeModelForCli('gemini', 'gemini-2.5-pro'), 'gemini-2.5-pro');
});

test('Gemini defaults to CLI-selected model when config model is stale or empty', () => {
  assert.equal(getDefaultModelForCli('gemini'), '');
  assert.equal(resolveModelForCli('gemini', 'gemini-3.1-flash-lite-preview'), 'gemini-3.1-flash-lite');
  assert.equal(resolveModelForCli('gemini', ''), '');
});

test('Gemini suggestions include current 3.1 labels and verified 2.5 ids', () => {
  assert.deepEqual(getSuggestedModelsForCli('gemini'), [
    'gemini-3.1-pro-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-live',
    'gemini-3.1-pro-preview-0219',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ]);
});

test('Codex suggestions exclude gpt-5.4-nano', () => {
  assert.deepEqual(getSuggestedModelsForCli('codex'), [
    'gpt-5.4',
    'gpt-5.4-mini',
    'codex-5.3',
    'codex-5.2',
  ]);
});
