import {
  levenshteinDistance,
  normalizeSpeech,
  parseVoiceCommand,
  similarity,
  VOICE_COMMANDS,
  VOICE_HELP_COMMANDS,
  VOICE_MATCH_THRESHOLD,
} from '@/features/voice/grammar';

/**
 * Voice grammar.
 *
 * The balancing act this file protects: a child with dysarthria or a strong
 * regional accent gets approximate transcripts, so matching must be tolerant —
 * but a matcher that fires on ordinary speech is worse than one that misses,
 * because the app then changes the screen while a learner is just talking.
 * Both directions are therefore tested: "reed this" must work, and a normal
 * sentence must not.
 */

describe('normalizeSpeech', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeSpeech('Read this, please!')).toBe('read this please');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeSpeech('   read    this  ')).toBe('read this');
  });
});

describe('levenshteinDistance', () => {
  it('is zero for identical strings', () => {
    expect(levenshteinDistance('speak', 'speak')).toBe(0);
  });

  it('counts a single substitution, insertion or deletion as one', () => {
    expect(levenshteinDistance('reet', 'read')).toBe(2); // two substitutions
    expect(levenshteinDistance('reed', 'read')).toBe(1);
    expect(levenshteinDistance('readd', 'read')).toBe(1);
  });

  it('handles empty inputs', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('', 'read')).toBe(4);
    expect(levenshteinDistance('read', '')).toBe(4);
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('read this', 'read this')).toBe(1);
  });

  it('returns 1 for two empty strings rather than dividing by zero', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('scores a one-character mis-transcription above the threshold', () => {
    expect(similarity('reed this', 'read this')).toBeGreaterThan(VOICE_MATCH_THRESHOLD);
  });
});

describe('parseVoiceCommand', () => {
  it('matches an exact phrase', () => {
    expect(parseVoiceCommand('read this')).toMatchObject({ id: 'speak-current', score: 1 });
  });

  it('matches a command inside a longer sentence', () => {
    // Learners often speak in full sentences, especially with speech differences.
    expect(parseVoiceCommand('can you please read this for me')?.id).toBe('speak-current');
  });

  it('ignores case and punctuation', () => {
    expect(parseVoiceCommand('READ THIS!')?.id).toBe('speak-current');
  });

  it('tolerates a mis-transcribed vowel', () => {
    expect(parseVoiceCommand('reed this')?.id).toBe('speak-current');
    expect(parseVoiceCommand('reed this')?.score).toBeLessThan(1);
  });

  it('accepts the aliases children actually use', () => {
    expect(parseVoiceCommand('big text')?.id).toBe('increase-text');
    expect(parseVoiceCommand('small text')?.id).toBe('decrease-text');
    expect(parseVoiceCommand('turn off voice')?.id).toBe('toggle-voice');
    expect(parseVoiceCommand('what can i say')?.id).toBe('help');
  });

  it('does not fire on ordinary speech', () => {
    const chatter = [
      'the cat sat on the mat',
      'i do not know the answer',
      'my name is asha',
      'this is a test',
      'bread',
      'the sun is hot today',
    ];

    for (const phrase of chatter) {
      expect(parseVoiceCommand(phrase)).toBeNull();
    }
  });

  it('returns null for empty or whitespace input', () => {
    expect(parseVoiceCommand('')).toBeNull();
    expect(parseVoiceCommand('   ')).toBeNull();
    expect(parseVoiceCommand('!!!')).toBeNull();
  });

  it('prefers the longer, more specific phrase when several could match', () => {
    // "stop reading" is a read-aloud command, not a bare "stop".
    expect(parseVoiceCommand('stop reading')?.id).toBe('toggle-speech');
  });

  it('reports the phrase it matched so the UI can show what it heard', () => {
    const match = parseVoiceCommand('reading ruler');
    expect(match?.matchedPhrase).toBe('reading ruler');
  });

  it('respects a custom threshold', () => {
    // With an impossible threshold, only exact containment matches.
    expect(parseVoiceCommand('reed this', { threshold: 0.99 })?.id).toBeUndefined();
    expect(parseVoiceCommand('read this', { threshold: 0.99 })?.id).toBe('speak-current');
  });

  it('gives every command a voice-command id that the command layer understands', () => {
    const knownIds = new Set([
      'toggle-panel',
      'toggle-ruler',
      'toggle-focus',
      'toggle-voice',
      'toggle-speech',
      'cycle-theme',
      'increase-text',
      'decrease-text',
      'reset-settings',
      'speak-current',
      'stop-speaking',
      'help',
      'close-panel',
    ]);

    for (const command of VOICE_COMMANDS) {
      expect(knownIds.has(command.id)).toBe(true);
      expect(command.phrases.length).toBeGreaterThan(0);
      expect(command.example.length).toBeGreaterThan(0);
    }
  });

  it('keeps the help list to a glanceable size', () => {
    expect(VOICE_HELP_COMMANDS.length).toBeGreaterThanOrEqual(5);
    expect(VOICE_HELP_COMMANDS.length).toBeLessThanOrEqual(10);
  });
});
