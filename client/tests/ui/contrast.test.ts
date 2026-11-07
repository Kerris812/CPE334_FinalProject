import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const source = readFileSync('src/styles/tokens.css', 'utf8');
const tokens = Object.fromEntries([...source.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const normal = [['cream','burgundy-900'],['cream','burgundy-700'],['burgundy-700','cream'],['burgundy-700','surface'],['burgundy-700','burgundy-50'],['espresso','cream'],['espresso','surface'],['espresso','burgundy-50'],['espresso','gold'],['taupe-text','cream'],['taupe-text','surface'],['taupe-text','burgundy-50'],['gold-text','cream'],['gold-text','surface'],['success','success-bg'],['cream','success'],['gold','burgundy-900']];
for (const [foreground, background] of [...normal, ['gold','burgundy-700']]) {
  test(`NFR-10 ${foreground} on ${background} meets computed WCAG contrast`, () => {
    expect(tokens[foreground]).toBeDefined(); expect(tokens[background]).toBeDefined();
    const [dark, light] = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => a - b);
    expect((light + .05) / (dark + .05)).toBeGreaterThanOrEqual(foreground === 'gold' && background === 'burgundy-700' ? 3 : 4.5);
  });
}
