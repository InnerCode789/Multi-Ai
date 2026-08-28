/**
 * Robust JSON parser that extracts structured JSON objects/arrays from LLM text responses,
 * safely handling <think>...</think> reasoning blocks, trailing text, unescaped newlines in strings,
 * missing commas between keys, and truncated outputs.
 */
export function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Strip reasoning / thinking tokens (e.g. <think>...</think> from DeepSeek R1 models)
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. If unclosed <think> tag exists, strip reasoning block
  if (text.includes('<think>') && !text.includes('</think>')) {
    const thinkIdx = text.indexOf('<think>');
    const afterThink = text.slice(thinkIdx + 7);
    const jsonInAfter = afterThink.indexOf('{');
    if (jsonInAfter !== -1) {
      text = afterThink.slice(jsonInAfter);
    } else {
      text = text.slice(0, thinkIdx);
    }
  }

  text = text.trim();

  // 3. Helper to sanitize unescaped control characters inside string literals and fix missing commas
  const sanitizeJsonString = (str) => {
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (escape) {
        result += c;
        escape = false;
        continue;
      }
      if (c === '\\') {
        result += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        result += c;
        continue;
      }
      if (inString) {
        if (c === '\n') result += '\\n';
        else if (c === '\r') result += '\\r';
        else if (c === '\t') result += '\\t';
        else if (c.charCodeAt(0) < 32) {
          result += ' ';
        } else {
          result += c;
        }
      } else {
        result += c;
      }
    }

    // Fix missing commas between properties (e.g. "value"\n  "key": -> "value",\n  "key":)
    let fixed = result.replace(/(["\dtruefalsenull\}\]])\s*\n\s*(["'][a-zA-Z0-9_$-]+["']\s*:)/g, '$1,\n  $2');
    // Remove trailing commas before } or ]
    fixed = fixed.replace(/,\s*([\}\]])/g, '$1');
    return fixed;
  };

  // 4. Try markdown JSON code blocks first
  const codeBlockMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g);
  for (const match of codeBlockMatches) {
    const candidate = match[1].trim();
    try {
      const sanitized = sanitizeJsonString(candidate);
      const parsed = JSON.parse(sanitized);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // 5. Scan for matching { ... } or [ ... ] using brace depth counting
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  const startIdx = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
  
  if (startIdx !== -1) {
    const isObject = text[startIdx] === '{';
    const openChar = isObject ? '{' : '[';
    const closeChar = isObject ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escape = false;
    let stack = [];

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{' || char === '[') {
          depth++;
          stack.push(char === '{' ? '}' : ']');
        } else if (char === '}' || char === ']') {
          depth--;
          stack.pop();
          if (depth === 0) {
            const rawSlice = text.substring(startIdx, i + 1);
            const sanitized = sanitizeJsonString(rawSlice);
            try {
              return JSON.parse(sanitized);
            } catch (e) {
              // keep scanning
            }
          }
        }
      }
    }

    // 6. Truncated output repair: if depth > 0 at end of text, attempt closing quotes & braces
    if (depth > 0) {
      let partialSlice = text.substring(startIdx);
      let repaired = sanitizeJsonString(partialSlice);
      if (inString) repaired += '"';
      while (stack.length > 0) {
        repaired += stack.pop();
      }
      repaired = sanitizeJsonString(repaired);
      try {
        return JSON.parse(repaired);
      } catch {}
    }

    // 7. Fallback: try raw slice between first and last brackets
    try {
      const lastClose = text.lastIndexOf(closeChar);
      if (startIdx !== -1 && lastClose > startIdx) {
        const fallbackSlice = text.substring(startIdx, lastClose + 1);
        const sanitized = sanitizeJsonString(fallbackSlice);
        return JSON.parse(sanitized);
      }
    } catch {}
  }

  // 8. If no JSON structure is found at all, wrap conversational / code response safely
  if (text.length > 0) {
    return {
      action: 'respond',
      summary: text.slice(0, 150).replace(/[\r\n]+/g, ' ').trim(),
      deliverable: text,
      filesChanged: []
    };
  }

  return null;
}
