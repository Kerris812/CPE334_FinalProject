import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '../../src/App';
test('foundation page identifies the application', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Nai Cha Restaurant Queue' })).toBeTruthy();
});
