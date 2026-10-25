/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    LEGACY_DB:D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
