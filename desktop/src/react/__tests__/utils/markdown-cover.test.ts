import { describe, expect, it } from 'vitest';
import {
  parseMarkdownCover,
  stripMarkdownFrontMatterForPreview,
  updateMarkdownCoverLayout,
} from '../../utils/markdown-cover';

describe('markdown cover utilities', () => {
  it('parses cover metadata and strips frontmatter from preview markdown', () => {
    const markdown = [
      '---',
      'title: Demo',
      'cover:',
      '  image: 文本附件/cover.png',
      '  actualRatio: 3:2',
      '  displayHeight: 360',
      '  positionX: 50',
      '  positionY: 42',
      '---',
      '# Demo',
      '',
      'Body',
    ].join('\n');

    expect(parseMarkdownCover(markdown)).toMatchObject({
      image: '文本附件/cover.png',
      actualRatio: '3:2',
      displayHeight: 360,
      positionX: 50,
      positionY: 42,
    });
    expect(stripMarkdownFrontMatterForPreview(markdown)).toBe('# Demo\n\nBody');
  });

  it('updates layout fields while preserving presentation metadata and removing deprecated generation metadata', () => {
    const markdown = [
      '---',
      'title: Demo',
      'cover:',
      '  image: 文本附件/cover.png',
      '  prompt: hidden generation prompt',
      '  promptPreset: modern-anime-paper-key-visual',
      '  preferredRatio: 3:2',
      '  actualRatio: 3:2',
      '  generatedAt: 2026-05-26T10:11:12.000Z',
      '  generator:',
      '    provider: openai',
      '    model: gpt-image-2',
      '  positionY: 42',
      'tags:',
      '  - writing',
      '---',
      '# Demo',
    ].join('\n');

    const next = updateMarkdownCoverLayout(markdown, {
      displayHeight: 420,
      positionX: 50,
      positionY: 64,
      displayWidth: 100,
    });

    expect(next).toContain('title: Demo');
    expect(next).toContain('tags:\n  - writing');
    expect(next).toContain('image: 文本附件/cover.png');
    expect(next).toContain('actualRatio: 3:2');
    expect(next).not.toContain('hidden generation prompt');
    expect(next).not.toContain('promptPreset:');
    expect(next).not.toContain('preferredRatio:');
    expect(next).not.toContain('generatedAt:');
    expect(next).not.toContain('generator:');
    expect(next).not.toContain('provider: openai');
    expect(next).toContain('displayHeight: 420');
    expect(next).toContain('positionX: 50');
    expect(next).toContain('positionY: 64');
    expect(next).toContain('displayWidth: 100');
    expect(next).toMatch(/\n---\n# Demo$/);
  });
});
