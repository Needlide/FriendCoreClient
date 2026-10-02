import { splitLinks } from './linkified-text';

describe('splitLinks', () => {
  it('leaves plain text untouched', () => {
    expect(splitLinks('just words')).toEqual([{ url: null, text: 'just words' }]);
  });

  it('links bare URLs and trims trailing punctuation', () => {
    expect(splitLinks('see https://example.com/a.')).toEqual([
      { url: null, text: 'see ' },
      { url: 'https://example.com/a', text: 'https://example.com/a' },
      { url: null, text: '.' },
    ]);
  });

  it('handles multiple URLs and http scheme', () => {
    const segments = splitLinks('a http://x.io b https://y.io/c?d=e f');
    expect(segments.filter((s) => s.url !== null).map((s) => s.url)).toEqual([
      'http://x.io',
      'https://y.io/c?d=e',
    ]);
  });

  it('ignores non-URL text like emails and bare domains', () => {
    const segments = splitLinks('mail me at bob@example.com or example.com');
    expect(segments.every((s) => s.url === null)).toBe(true);
  });
});
