import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import YAML from 'yaml';
import { AppConfig } from './types';

const CONFIG_PATH = join(process.cwd(), 'config.yaml');

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  if (!existsSync(CONFIG_PATH)) {
    cachedConfig = {
      cli: 'claude',
      workspace: '.',
      agents: [
        {
          name: 'Research',
          column: 1,
          system_prompt: 'You are a research specialist. Provide thorough, well-structured findings.',
          on_complete: 'move_to_review',
        },
        {
          name: 'Coder',
          column: 2,
          system_prompt: 'You are a senior developer. Write clean, production-quality code.',
          on_complete: 'move_to_review',
        },
        {
          name: 'Reviewer',
          column: 3,
          system_prompt: 'You review work for quality, correctness, and completeness.',
          on_complete: 'move_to_review',
        },
      ],
    };
    return cachedConfig;
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  cachedConfig = YAML.parse(raw) as AppConfig;
  return cachedConfig;
}

export function getWorkspace(): string {
  const config = getConfig();
  return resolve(config.workspace || '.');
}

export function updateConfigCli(cli: string): void {
  const config = getConfig();
  config.cli = cli;
  const yaml = YAML.stringify(config);
  writeFileSync(CONFIG_PATH, yaml, 'utf-8');
  cachedConfig = config;
}

export function updateConfigModel(model: string): void {
  const config = getConfig();
  config.model = model;
  const yaml = YAML.stringify(config);
  writeFileSync(CONFIG_PATH, yaml, 'utf-8');
  cachedConfig = config;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
