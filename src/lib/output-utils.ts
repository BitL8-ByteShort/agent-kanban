export function extractAnswerText(output: string, cliHint?: string): string {
  const trimmed = output.trim();
  if (!trimmed) return '';

  if (cliHint === 'codex' || /\ncodex\s*\n/i.test(`\n${trimmed}\n`)) {
    return extractCodexAnswer(trimmed);
  }

  return trimmed;
}

export function buildDisplayDetails(output: string, cliHint?: string): string {
  const trimmed = output.trim();
  if (!trimmed) return '';

  if (cliHint === 'codex' || /\ncodex\s*\n/i.test(`\n${trimmed}\n`)) {
    return cleanCodexDetails(trimmed);
  }

  return trimmed;
}

export function getPreferredCardText(card: { answer?: string; output?: string }): string {
  return card.answer?.trim() || card.output?.trim() || '';
}

function extractCodexAnswer(output: string): string {
  const lines = output.split(/\r?\n/);
  let lastCodexLine = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === 'codex') {
      lastCodexLine = i;
    }
  }

  if (lastCodexLine >= 0) {
    let end = lines.length;
    for (let i = lastCodexLine + 1; i < lines.length; i += 1) {
      if (lines[i].trim() === 'tokens used') {
        end = i;
        break;
      }
    }

    const answer = lines.slice(lastCodexLine + 1, end).join('\n').trim();
    if (answer) return answer;
  }

  return output.trim();
}

function cleanCodexDetails(output: string): string {
  const lines = output.split(/\r?\n/);
  const cleaned: string[] = [];
  let skippingUserBlock = false;
  let skipNextNumericTokenLine = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skipNextNumericTokenLine) {
      skipNextNumericTokenLine = false;
      if (/^[\d,]+$/.test(trimmed)) {
        continue;
      }
    }

    if (!trimmed) continue;

    if (
      /^OpenAI Codex v/i.test(trimmed) ||
      trimmed === '--------' ||
      /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(trimmed)
    ) {
      continue;
    }

    if (trimmed === 'user') {
      skippingUserBlock = true;
      continue;
    }

    if (trimmed === 'codex') {
      skippingUserBlock = false;
      continue;
    }

    if (trimmed === 'tokens used') {
      skipNextNumericTokenLine = true;
      continue;
    }

    if (skippingUserBlock) {
      if (/^web search:/i.test(trimmed)) {
        skippingUserBlock = false;
      } else {
        continue;
      }
    }

    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}
