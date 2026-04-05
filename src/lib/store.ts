import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Card } from './types';
import { buildDisplayDetails, extractAnswerText } from './output-utils';

const DATA_PATH = join(process.cwd(), 'data', 'board.json');

function ensureDataDir(): void {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
  }
}

function readBoard(): Card[] {
  ensureDataDir();
  if (!existsSync(DATA_PATH)) return [];
  const raw = readFileSync(DATA_PATH, 'utf-8');
  const cards = JSON.parse(raw) as Card[];
  return cards.map((card) => ({
    ...card,
    answer: card.answer ?? extractAnswerText(card.output || ''),
    details: card.details ?? buildDisplayDetails(card.output || ''),
  }));
}

function writeBoard(cards: Card[]): void {
  ensureDataDir();
  writeFileSync(DATA_PATH, JSON.stringify(cards, null, 2), 'utf-8');
}

export function getAllCards(): Card[] {
  return readBoard();
}

export function getCard(id: string): Card | undefined {
  return readBoard().find((c) => c.id === id);
}

export function createCard(card: Card): Card {
  const cards = readBoard();
  cards.push(card);
  writeBoard(cards);
  return card;
}

export function updateCard(id: string, updates: Partial<Card>): Card | null {
  const cards = readBoard();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cards[idx] = { ...cards[idx], ...updates, updatedAt: new Date().toISOString() };
  writeBoard(cards);
  return cards[idx];
}

export function deleteCard(id: string): boolean {
  const cards = readBoard();
  const filtered = cards.filter((c) => c.id !== id);
  if (filtered.length === cards.length) return false;
  writeBoard(filtered);
  return true;
}
