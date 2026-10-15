import postgres from 'postgres';

/**
 * With TEST_DATABASE_URL, every test file migrates its own database in
 * parallel. Roles are shared by the whole Postgres server, so parallel
 * `create role` calls in the migrations race each other. Creating them once
 * here, before any worker starts, makes the migrations' "if not exists"
 * checks find them.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const role of ['gg_user', 'anon', 'authenticated']) {
      const [exists] = await sql`select 1 from pg_roles where rolname = ${role}`;
      if (!exists) await sql.unsafe(`create role ${role} nologin`);
    }
    await sql.unsafe('grant gg_user to current_user');
  } finally {
    await sql.end();
  }
}
