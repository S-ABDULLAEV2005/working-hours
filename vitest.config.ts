import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Серверная функция импортирует supabase-js как в Deno; в тесте подменяем на подделку.
      'npm:@supabase/supabase-js@2': fileURLToPath(new URL('./test/edge/fakeSupabase.ts', import.meta.url)),
    },
  },
});
