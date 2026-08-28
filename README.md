# 677078.xyz

This is where I host my blogs, and other stuff. This project is built with [Astro](https://astro.build)
and [Bun](https://bun.sh), hosted on [Cloudflare](https://cloudflare.com) via wrangler.

Visit the site at [677078.xyz](https://677078.xyz).

**Local Development**:

```bash
bun run dev
```

**Local Wrangler Preview**:

```bash
bun run wdev
```

**Database Migrations**:

Apply migrations locally:

```bash
bun run db:migrate
```

Apply migrations to production D1:

```bash
bun run wrangler d1 migrations apply website_677078_xyz_db --remote
```

**Initial Admin Setup**:

Because default credentials are not seeded automatically, provision the admin
account using the seed script:

1. Local setup:

```bash
bun run seed:admin <username> <password> --local
```

2. Production setup:

```bash
bun run seed:admin <username> <password> --remote
```

Alternatively, generate the SQL statement by omitting `--local` or `--remote`
and execute it manually with `wrangler d1 execute`:

```bash
bun run seed:admin myadmin mysecurepassword
bun run wrangler d1 execute website_677078_xyz_db --remote --command "<SQL_STATEMENT>"
```

**Deployment**:

```bash
bun run wdeploy
```
