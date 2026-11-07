import { expect, test } from 'vitest';
import { testDatabaseUrl } from '../../src/infrastructure/test-database.js';

test('requires explicit disposable database and rejects the development database', () => {
  expect(() => testDatabaseUrl(undefined, undefined)).toThrow();
  expect(() => testDatabaseUrl('postgresql://u:p@localhost/app_test', 'postgresql://other@localhost/app_test')).toThrow();
  expect(() => testDatabaseUrl('postgresql://u:p@localhost/app', undefined)).toThrow();
  expect(testDatabaseUrl('postgresql://u:p@localhost/app_test', 'postgresql://u:p@localhost/app')).toContain('app_test');
});
