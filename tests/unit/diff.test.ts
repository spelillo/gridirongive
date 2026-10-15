import { describe, it, expect } from 'vitest';
import { diffWords } from '@/lib/domain/diff';

const text = (parts: ReturnType<typeof diffWords>, kinds: string[]) => parts.filter((p) => kinds.includes(p.kind)).map((p) => p.text).join('');

describe('diffWords', () => {
  it('returns one unchanged part for identical text', () => {
    expect(diffWords('I play tight end.', 'I play tight end.')).toEqual([{ text: 'I play tight end.', kind: 'same' }]);
  });

  it('marks added and removed words', () => {
    const parts = diffWords('I play tight end.', 'I play wide receiver and tight end.');
    expect(text(parts, ['added']).trim()).toBe('wide receiver and');
    expect(text(parts, ['removed'])).toBe('');
  });

  it('rebuilds both versions exactly', () => {
    const before = 'My cleats split at the toe last month.';
    const after = 'My cleats split at the heel in August, and my pads are too small.';
    const parts = diffWords(before, after);
    expect(text(parts, ['same', 'removed'])).toBe(before);
    expect(text(parts, ['same', 'added'])).toBe(after);
  });

  it('handles an empty side', () => {
    expect(diffWords('', 'New bio')).toEqual([{ text: 'New bio', kind: 'added' }]);
    expect(diffWords('Old bio', '')).toEqual([{ text: 'Old bio', kind: 'removed' }]);
  });
});
