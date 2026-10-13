# Backup and restore

A complete SIMS backup has three parts. All three are needed to restore a working system.

| Part                       | What it holds                                                                  | How                        |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| MariaDB database           | every record, the audit log, file hashes, chain of custody, integrity triggers | `mysqldump`/`mariadb-dump` |
| File store (`STORAGE_DIR`) | evidence originals, statements, signed statements, reports                     | file-level copy            |
| Secrets                    | `DATA_ENCRYPTION_KEY` and `SESSION_SECRET`                                     | a password manager / vault |

Without `DATA_ENCRYPTION_KEY`, restored two-step verification secrets cannot be decrypted and every
user with MFA would need an administrator reset. Store backups encrypted and access-controlled: they
contain confidential investigation data.

## Backing up

Take the database dump first, then copy the file store, so every file the dump refers to is present.

```bash
# 1. Database. --single-transaction gives a consistent snapshot without locking the app out;
#    --triggers (the default, stated for clarity) includes the integrity guards. -p prompts for the
#    password so it never appears in the process list or shell history.
mysqldump --single-transaction --triggers --routines --default-character-set=utf8mb4 \
  -h 127.0.0.1 -u DB_USER -p DB_NAME | gzip > sims-$(date +%Y%m%d-%H%M).sql.gz

# 2. File store (preserves read-only permissions; originals are immutable, so incremental copies are safe)
rsync -a /data/storage/ /backups/sims-storage/          # Linux
robocopy D:\sims\storage E:\backups\sims-storage /MIR   # Windows
```

`mariadb-dump` is the same tool under its MariaDB name. On cPanel without SSH, phpMyAdmin →
**Export** → _Custom_ also works: keep "Add CREATE TRIGGER statement" ticked. cPanel's own
**Backup** page can also download the database. In every case, check that the file contains
`CREATE TRIGGER` lines; a dump without them restores a database with no integrity guards.

With the Docker Compose stack:

```bash
docker compose exec db sh -c 'mariadb-dump --single-transaction --triggers -u sims -p"$MARIADB_PASSWORD" sims' | gzip > sims-$(date +%Y%m%d).sql.gz
docker run --rm -v sims_sims-storage:/data -v "$PWD":/backup alpine tar czf /backup/sims-storage.tgz -C /data .
```

For the project-local development instance the client tools are in `~/mariadb1011/bin`
(`mariadb-dump.exe` on Windows), the host is `127.0.0.1` and the port is 3307.

Recommended schedule: nightly database dumps kept for 35 days, weekly copies kept for a year, a
file-store copy after each dump, and always a dump immediately before `prisma migrate deploy`. Keep
at least one copy off-site.

## Restoring

1. Stop the app and the worker.
2. Restore the dump into an **empty** database (on cPanel: create it in **MySQL Databases**, add
   the user with ALL PRIVILEGES, and run the utf8mb4 `ALTER DATABASE` from
   [DEPLOYMENT.md](DEPLOYMENT.md)):

   ```bash
   gunzip -c sims-YYYYMMDD-HHMM.sql.gz | mysql -h 127.0.0.1 -u DB_USER -p DB_NAME
   ```

   The dump creates each table's triggers after inserting its rows, so the append-only and
   immutability guards do not block the restore. They do block overwriting existing audit,
   evidence and custody rows, which is why the target must be empty.

   **Different database user?** Every trigger in the dump carries `DEFINER=` the user that created
   it. Restoring as another user (for example after moving to a new cPanel account) fails with an
   "access denied; you need … SUPER" error unless those clauses are removed first:

   ```bash
   gunzip -c sims-YYYYMMDD-HHMM.sql.gz | sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' | mysql -h 127.0.0.1 -u DB_USER -p DB_NAME
   ```

3. Confirm the guards came back:
   `SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();` (expect 46).
4. Restore the file store to `STORAGE_DIR` (same folder layout).
5. Set the same `DATA_ENCRYPTION_KEY` and `SESSION_SECRET` as the backed-up system.
6. Check that the schema is current and the files are intact:

   ```bash
   npx prisma migrate status      # expect "Database schema is up to date"
   npm run verify-storage         # every stored file must match its recorded SHA-256
   ```

7. Start the app and the worker, sign in and open a case with evidence to confirm.

## Testing restores

Restore the latest backup into a separate database (for example `cpaneluser_sims_restore`) at least
once a quarter and run `npm run verify-storage` with `DATABASE_URL` and `STORAGE_DIR` pointing at the
restored copies. A backup that has never been restored is not a backup.
