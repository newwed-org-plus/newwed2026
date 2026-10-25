export function isDatabaseUnavailable(error:unknown):boolean {
  const message=error instanceof Error ? error.message : String(error);
  return /(?:D1|database|SQLITE).*(?:daily.*limit|quota|overload|unavailable|timed?\s?out|SQLITE_BUSY)|exceeded D1|daily row (?:read|write) limit/i.test(message);
}

export function isDailyQuotaError(error:unknown):boolean {
  return /daily.*(?:limit|quota)|quota.*exceeded/i.test(error instanceof Error ? error.message : String(error));
}
