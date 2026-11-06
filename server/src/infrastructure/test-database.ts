/** Integration fixtures are permitted only in an explicitly named test database. */
export function testDatabaseUrl(value: string | undefined, development: string | undefined): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required; use a separate disposable PostgreSQL database.');
  const target = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.pathname.endsWith('_test')) {
    throw new Error('Disposable PostgreSQL database name must end in _test.');
  }
  if (development) {
    const source = new URL(development);
    if (target.pathname === source.pathname) throw new Error('Test and development database names must differ.');
  }
  return value;
}
