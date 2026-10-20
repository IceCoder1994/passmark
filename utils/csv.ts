import type { VaultItem } from '../types';

/**
 * RFC 4180 compliant CSV parser
 * Handles commas, quotes, escaped quotes (""), and newlines inside quoted fields.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some((f) => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface ParsedCredential {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes?: string;
}

/**
 * Parse Chrome / Edge / Firefox exported passwords CSV into structured credentials
 */
export function parseChromePasswordsCSV(csvContent: string): ParsedCredential[] {
  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());

  // Dynamically map column indices
  let nameIdx = header.findIndex((h) => h === 'name' || h === 'title');
  let urlIdx = header.findIndex((h) => h === 'url' || h === 'website' || h === 'web' || h === 'login_uri');
  let userIdx = header.findIndex((h) => h === 'username' || h === 'user' || h === 'login' || h === 'account');
  let passIdx = header.findIndex((h) => h === 'password' || h === 'pwd' || h === 'pass');
  let noteIdx = header.findIndex((h) => h === 'note' || h === 'notes' || h === 'comment');

  // Fallback defaults for Chrome if headers match standard positions: name,url,username,password,note
  if (nameIdx === -1) nameIdx = 0;
  if (urlIdx === -1) urlIdx = 1;
  if (userIdx === -1) userIdx = 2;
  if (passIdx === -1) passIdx = 3;

  const results: ParsedCredential[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const password = (row[passIdx] || '').trim();
    const rawUrl = (row[urlIdx] || '').trim();
    const rawName = (row[nameIdx] || '').trim();
    const username = (row[userIdx] || '').trim();
    const notes = noteIdx !== -1 && row[noteIdx] ? row[noteIdx].trim() : '';

    // Ignore entries with empty password and empty username
    if (!password && !username) {
      continue;
    }

    let domain = '';
    if (rawUrl) {
      try {
        const u = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
        domain = u.hostname;
      } catch {
        domain = rawUrl;
      }
    }

    const title = rawName || domain || '未命名网站';
    const urls = domain ? [domain] : rawUrl ? [rawUrl] : [];

    results.push({
      title,
      username,
      password,
      urls,
      notes,
    });
  }

  return results;
}
