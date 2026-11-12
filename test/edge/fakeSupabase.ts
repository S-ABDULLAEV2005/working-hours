/** Минимальная подделка supabase-js для теста серверной функции admin-users. */
type Row = Record<string, unknown>;

export const store = {
  users: [] as { id: string; email: string; password: string; created_at: string; last_sign_in_at: string | null }[],
  profiles: [] as Row[],
  employees: [] as Row[],
  tokens: new Map<string, string>(), // token → user id
  failProfileInsert: false,
};

let seq = 0;
export function reset() {
  store.users = [];
  store.profiles = [];
  store.employees = [];
  store.tokens.clear();
  store.failProfileInsert = false;
  seq = 0;
}
export function addUser(email: string, role: 'admin' | 'viewer' | null, token?: string) {
  const id = `u${++seq}`;
  store.users.push({ id, email, password: 'x', created_at: '2026-11-11T00:00:00Z', last_sign_in_at: null });
  if (role) store.profiles.push({ user_id: id, full_name: email.split('@')[0], role });
  if (token) store.tokens.set(token, id);
  return id;
}

class Query {
  private filters: [string, unknown][] = [];
  private op: 'select' | 'update' | 'insert' = 'select';
  private patch: Row = {};
  private countMode = false;
  private head = false;
  private returning = false;
  constructor(private table: string) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== 'select') this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push([col, v]);
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  insert(row: Row) {
    if (store.failProfileInsert) return Promise.resolve({ error: { message: 'insert failed' } });
    (store as unknown as Record<string, Row[]>)[this.table].push(row);
    return Promise.resolve({ error: null });
  }
  private rows() {
    return ((store as unknown as Record<string, Row[]>)[this.table] ?? []).filter((r) =>
      this.filters.every(([c, v]) => r[c] === v),
    );
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
  }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
    let out: unknown;
    if (this.op === 'update') {
      const rows = this.rows();
      rows.forEach((r) => Object.assign(r, this.patch));
      out = { data: this.returning ? rows : null, error: null };
    } else if (this.countMode) {
      out = { count: this.rows().length, data: this.head ? null : this.rows(), error: null };
    } else {
      out = { data: this.rows(), error: null };
    }
    return Promise.resolve(out).then(res, rej);
  }
}

export function createClient() {
  return {
    from: (t: string) => new Query(t),
    auth: {
      getUser: async (token: string) => {
        const id = store.tokens.get(token);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } };
      },
      admin: {
        listUsers: async () => ({ data: { users: [...store.users] }, error: null }),
        createUser: async ({ email, password }: { email: string; password: string }) => {
          if (store.users.some((u) => u.email === email))
            return { data: null, error: { message: 'A user with this email address has already been registered' } };
          const id = `u${++seq}`;
          store.users.push({ id, email, password, created_at: '2026-11-11T00:00:00Z', last_sign_in_at: null });
          return { data: { user: { id } }, error: null };
        },
        updateUserById: async (id: string, { password }: { password: string }) => {
          const u = store.users.find((x) => x.id === id);
          if (!u) return { error: { message: 'User not found' } };
          u.password = password;
          return { error: null };
        },
        deleteUser: async (id: string) => {
          store.users = store.users.filter((u) => u.id !== id);
          store.profiles = store.profiles.filter((p) => p.user_id !== id);
          return { error: null };
        },
      },
    },
  };
}
