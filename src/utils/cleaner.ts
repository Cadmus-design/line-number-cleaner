import { CleanPattern, CleanerSettings, TextPurifierSettings } from '../types';

const PATTERNS: Record<Exclude<CleanPattern, 'Auto' | 'Custom'>, RegExp> = {
  Colon: /^\s*\d+:\s?/,
  Dot: /^\s*\d+\.\s?/,
  Pipe: /^\s*\d+\s*\|\s?/,
  Bracket: /^\s*\[\d+\]\s?/,
  Parenthesis: /^\s*\(\d+\)\s?/,
  RawNumber: /^\s*\d+\s+/
};

/**
 * Automatically detects the line numbering pattern from the text
 */
export function detectPattern(text: string): { pattern: CleanPattern; confidence: number } {
  const lines = text.split(/\r?\n/).map(l => l.trimRight());
  const nonEnumLines = lines.filter(l => l.trim().length > 0);
  
  if (nonEnumLines.length === 0) {
    return { pattern: 'Auto', confidence: 0 };
  }

  const scores: Record<Exclude<CleanPattern, 'Auto' | 'Custom'>, number> = {
    Colon: 0,
    Dot: 0,
    Pipe: 0,
    Bracket: 0,
    Parenthesis: 0,
    RawNumber: 0
  };

  // Check each pattern across non-empty lines
  for (const line of nonEnumLines) {
    for (const [key, regex] of Object.entries(PATTERNS)) {
      if (regex.test(line)) {
        scores[key as keyof typeof scores]++;
      }
    }
  }

  // Find the pattern with the highest score
  let maxScore = 0;
  let bestPattern: Exclude<CleanPattern, 'Auto' | 'Custom'> | null = null;

  for (const [key, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestPattern = key as Exclude<CleanPattern, 'Auto' | 'Custom'>;
    }
  }

  // If we have a pattern and it matches a substantial portion of non-empty lines (e.g. >= 40% or at least 1 if only 1 line)
  if (bestPattern) {
    const ratio = maxScore / nonEnumLines.length;
    if (ratio >= 0.4 || maxScore >= 2) {
      return { pattern: bestPattern, confidence: Math.round(ratio * 100) };
    }
  }

  return { pattern: 'Auto', confidence: 0 };
}

export function stripListSequence(str: string): string {
  let clean = str;
  let previous = '';
  let iterations = 0;
  
  while (clean !== previous && iterations < 8) {
    previous = clean;
    iterations++;
    
    // 1. Remove leading spaces/tabs
    clean = clean.replace(/^[ \t]+/, '');
    
    // 2. Remove standard bullets & blockquotes/quoting bars (e.g. *, -, +, •, ●, >, |, ▎, ▏, etc.)
    clean = clean.replace(/^(?:[*+•◦▪▫▶◆◇●■\-]|[>|║│┃]|[▏▎▍▌▋▊▉█])\s*/, '');
    
    // 3. Remove numbered/lettered lists with separators (e.g., "1. ", "1: ", "a. ", "A) ", "12. ")
    clean = clean.replace(/^(?:\d+|[a-zA-Z])[:.)\]]\s*/, '');
    
    // 4. Remove parenthesized/bracketed list numbers (e.g. "(1) ", "[32] ", "[a] ")
    clean = clean.replace(/^(?:\([a-zA-Z0-9]+\)|\[[a-zA-Z0-9]+\])\s*/, '');
    
    // 5. Remove plain numbers followed by spaces/tabs (e.g. "3 * Invoice" -> removes "3 ", leaving "* Invoice")
    clean = clean.replace(/^\d+\s+/, '');
  }
  
  // If the entire remaining line is just a standalone word like "11" (which is likely a line index), clear it
  if (/^\s*\d+\s*$/.test(clean)) {
    clean = '';
  }
  
  return clean;
}

/**
 * Cleans the input code according to settings
 */
export function cleanCode(
  text: string,
  settings: CleanerSettings
): { cleanedText: string; detectedPattern: string; detectionConfidence?: number } {
  if (!text) {
    return { cleanedText: '', detectedPattern: 'None' };
  }

  let workingText = text;
  
  // 1. Optionally strip Markdown code block tags at start/end
  if (settings.stripMarkdown) {
    const lines = workingText.split(/\r?\n/);
    if (lines.length >= 2) {
      const firstLine = lines[0].trim();
      const lastLine = lines[lines.length - 1].trim();
      
      let startIdx = 0;
      let endIdx = lines.length;
      
      if (firstLine.startsWith('```')) {
        startIdx = 1;
      }
      if (lastLine === '```' && endIdx > startIdx) {
        endIdx = lines.length - 1;
      }
      
      if (startIdx > 0 || endIdx < lines.length) {
        workingText = lines.slice(startIdx, endIdx).join('\n');
      }
    }
  }

  // 2. Determine pattern to use
  let patternToUse: CleanPattern = settings.pattern;
  let confidence: number | undefined;

  if (settings.pattern === 'Auto') {
    const detection = detectPattern(workingText);
    if (detection.pattern !== 'Auto') {
      patternToUse = detection.pattern;
      confidence = detection.confidence;
    } else {
      // Fallback
      patternToUse = 'Colon'; // Default fallback
    }
  }

  // 3. Get the regex or create custom one
  let regex: RegExp | null = null;
  if (patternToUse === 'Custom') {
    try {
      if (settings.customRegex) {
        // Construct standard start-of-line matching
        regex = new RegExp(settings.customRegex);
      }
    } catch (e) {
      console.error('Invalid custom regex:', e);
    }
  } else if (patternToUse !== 'Auto') {
    regex = PATTERNS[patternToUse];
  }

  // 4. Process line by line
  const lines = workingText.split(/\r?\n/);
  const cleanedLines: string[] = [];

  for (const line of lines) {
    // If the line is empty, skip processing or keep it as is
    if (line.trim().length === 0) {
      if (settings.removeBlankLines) {
        continue;
      }
      cleanedLines.push('');
      continue;
    }

    let processedLine = line;

    if (regex) {
      processedLine = line.replace(regex, '');
    }

    if (settings.stripBullets) {
      const leadingWhitespace = settings.preserveIndent ? (processedLine.match(/^[ \t]+/) || [''])[0] : '';
      const stripped = stripListSequence(processedLine);
      processedLine = leadingWhitespace + stripped;
    }

    if (settings.trimLines) {
      processedLine = processedLine.trim();
    }

    cleanedLines.push(processedLine);
  }

  let finalCleaned = cleanedLines.join('\n');

  // Trim trailing/leading whitespace of whole block if requested, or clean leading empty lines
  if (settings.removeBlankLines) {
    finalCleaned = finalCleaned.split('\n').filter(l => l.trim().length > 0).join('\n');
  }

  return {
    cleanedText: finalCleaned,
    detectedPattern: patternToUse === 'Custom' ? 'Custom Regex' : patternToUse,
    detectionConfidence: confidence
  };
}

/**
 * Text purification helper for cleaning extra whitespaces, paragraphs, and blank lines from AI output.
 */
export function purifyText(
  text: string,
  settings: TextPurifierSettings
): string {
  if (!text) return '';

  let working = text;

  // 1. Normalize line endings
  working = working.replace(/\r\n/g, '\n');

  // 2. Clear Markdown envelope if it exists
  const linesForMd = working.split('\n');
  if (linesForMd.length >= 2) {
    const firstLine = linesForMd[0].trim();
    const lastLine = linesForMd[linesForMd.length - 1].trim();
    let startIdx = 0;
    let endIdx = linesForMd.length;
    if (firstLine.startsWith('```')) startIdx = 1;
    if (lastLine === '```' && endIdx > startIdx) endIdx = linesForMd.length - 1;
    if (startIdx > 0 || endIdx < linesForMd.length) {
      working = linesForMd.slice(startIdx, endIdx).join('\n');
    }
  }

  // 3. Process paragraph wrapping merge if enabled
  if (settings.removeLineBreakInParagraph) {
    // Split text by blank lines to isolate separate paragraphs
    const paragraphs = working.split(/\n\s*\n/);
    const purifiedParagraphs = paragraphs.map(para => {
      const paraLines = para.split('\n').map(l => {
        let lClean = l;
        if (settings.removeLeadingSpaces) lClean = lClean.replace(/^[ \t]+/, '');
        if (settings.removeTrailingSpaces) lClean = lClean.replace(/[ \t]+$/, '');
        if (settings.stripBullets) {
          lClean = stripListSequence(lClean);
        }
        return lClean;
      }).filter(Boolean);

      if (paraLines.length === 0) return '';
      
      // Smart join of lines
      let joined = paraLines[0];
      for (let i = 1; i < paraLines.length; i++) {
        const prevLine = paraLines[i - 1];
        const currLine = paraLines[i];
        
        // Check if previous line ends with Chinese and current line starts with Chinese
        const endsWithChinese = /[\u4e00-\u9fa5]$/.test(prevLine);
        const startsWithChinese = /^[\u4e00-\u9fa5]/.test(currLine);
        
        if (endsWithChinese && startsWithChinese) {
          // Join directly with no space for pure CJK
          joined += currLine;
        } else {
          // Join with space for English or Mixed
          joined += ' ' + currLine;
        }
      }
      return joined;
    }).filter(Boolean);

    working = purifiedParagraphs.join('\n\n');
  } else {
    // Standard line-by-line adjustment (No paragraph merge)
    let lines = working.split('\n');
    lines = lines.map(line => {
      let l = line;
      if (settings.removeLeadingSpaces) {
        l = l.replace(/^[ \t]+/, '');
      }
      if (settings.removeTrailingSpaces) {
        l = l.replace(/[ \t]+$/, '');
      }
      if (settings.stripBullets) {
        l = stripListSequence(l);
      }
      return l;
    });
    working = lines.join('\n');
  }

  // 4. Normalize spaces (reduce multiple spaces to single space)
  if (settings.normalizeSpaces) {
    // Keep paragraph formatting but minimize extra sequential run-spaces
    working = working.replace(/[ \t]{2,}/g, ' ');
  }

  // 5. Remove space between Chinese characters
  if (settings.removeSpacesBetweenChinese) {
    // Matches a CJK char, optional spaces/tabs, and another CJK char
    working = working.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    // Also strip space between Chinese char and CJK punctuation
    working = working.replace(/([\u4e00-\u9fa5])\s+([，。！？；：「」〔〕『』《》〈〉（）])/g, '$1$2');
    working = working.replace(/([，。！？；：「」〔〕『』《》〈〉（）])\s+([\u4e00-\u9fa5])/g, '$1$2');
  }

  // 6. Collapse duplicate newlines (collapse multiple empty lines into a single blank line)
  if (settings.collapseNewlines) {
    working = working.replace(/\n{3,}/g, '\n\n');
  }

  // 7. Strip Emojis
  if (settings.stripEmoji) {
    // Soft emoji removal matches
    working = working.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
  }

  return working.trim();
}
