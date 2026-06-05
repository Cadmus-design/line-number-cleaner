export type CleanPattern = 'Auto' | 'Colon' | 'Dot' | 'Pipe' | 'Bracket' | 'Parenthesis' | 'RawNumber' | 'Custom';

export interface CleanerSettings {
  pattern: CleanPattern;
  customRegex: string;
  trimLines: boolean;
  removeBlankLines: boolean;
  autoCopy: boolean;
  preserveIndent: boolean;
  stripMarkdown: boolean; // strips starting/ending ``` codeblocks if present
  stripBullets: boolean;  // Remove bullet points (-, *, •, etc)
  newlineMode?: 'enter' | 'shiftEnter' | 'doubleEnter'; // Newline copy mode: 'enter' (hard return), 'shiftEnter' (soft return), 'doubleEnter' (double newlines / Blinko)
}

export interface TextPurifierSettings {
  removeLeadingSpaces: boolean;
  removeTrailingSpaces: boolean;
  collapseNewlines: boolean;        // Collapse consecutive blank lines to one
  removeLineBreakInParagraph: boolean; // Merge wrapped paragraph lines
  removeSpacesBetweenChinese: boolean; // Double spaces or spaces adjacent to Chinese
  normalizeSpaces: boolean;            // Reduce multiple spaces to single space
  stripEmoji: boolean;
  stripBullets: boolean;               // Remove bullet points (-, *, •, etc)
  autoCopy: boolean;
  newlineMode?: 'enter' | 'shiftEnter' | 'doubleEnter'; // Newline copy mode: 'enter' (hard return), 'shiftEnter' (soft return), 'doubleEnter' (double newlines / Blinko)
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalText: string;
  cleanedText: string;
  detectedPattern: string; // or 'Text Purify'
  mode: 'code' | 'text';
}
