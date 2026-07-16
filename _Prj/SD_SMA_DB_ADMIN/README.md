# SD SMA DB Admin

Standalone database administration web tool for SD SMA runtime packages.

Default URL when launched through `_Launcher`:

- `http://127.0.0.1:8093/admin`

Main functions:

- Test MySQL / MariaDB connection.
- List databases and tables (with approximate sizes).
- Backup a whole database or a single table to SQL (`mysqldump` / `mariadb-dump`).
- Restore completed SQL backups directly on the server (manifest + SHA-256).
- Export a table to CSV for small data exchange; import completed CSV exports on the server.
- Register external local `.sql` / `.csv` files into the backup directory (no browser upload).

## Export / restore model

All restore and import paths are **server-side only**. Browser file upload is not used.

| Action | Format | Typical use |
|--------|--------|-------------|
| Backup database | `.sql` + manifest | Full database backup / restore |
| Backup table | `.sql` + manifest | GB-scale single table backup / restore |
| Export CSV | `.csv` + manifest | Small table exchange only |
| Register local file | copy into `backup_dir` + manifest | Bring external dumps into the tool |

Completed files live under `backup_dir` and/or `last_output_dir`. Large restores must use
**直接恢复 SQL** / **直接导入 CSV**, not browser upload.

For GB-scale single tables, prefer **备份当前表为 SQL**. CSV is not recommended as a
primary backup format for large tables.

SQL dumps include `--add-drop-table`, so restoring a table dump may replace an existing
table of the same name in the target database.

## Large backup safeguards

- SQL dumps are written to a `.partial` file and atomically renamed only after success.
- Each completed SQL / CSV export has a SHA-256 manifest.
- Backup names include microseconds to prevent same-second collisions.
- Free disk space is checked before `mysqldump` starts.
- Backup/restore progress tracks transferred bytes; CSV progress uses row counts.
- Downloads support HTTP byte ranges (`206 Partial Content`).
- Destructive restore/import requires a short-lived, operation-bound confirmation token.
- Cross-origin state-changing browser requests are rejected.
- Running jobs are bounded by `max_concurrent_jobs` and can be cancelled.

## MySQL / MariaDB client tools

Resolution order:

1. Absolute paths in `mysql_tools` inside `config/default.json`
2. Tools available on `PATH` (`mysqldump` / `mysql`, or `mariadb-dump` / `mariadb`)
3. Auto-scan under:
   - project-local `_tools` (`SD_SMA_DB_ADMIN/_tools`)
   - sibling `_tools` next to the project folder (`_Prj/_tools`)

Binaries under a `bin/` directory are preferred when multiple matches exist.

If no client is found, the job fails with
`找不到 MySQL/MariaDB 客户端工具: ...` instead of a raw `WinError 2`.

MySQL 8 dump clients automatically receive `--column-statistics=0` for MariaDB servers.

## Export directories

- Default export directory is `backup_dir`.
- Any writable folder may be selected; the last choice is remembered as `last_output_dir`.
- Lists / downloads / restores scan `backup_dir` and `last_output_dir`.

Database passwords are never returned by `/api/config`.

For large backups, keep at least `backup_free_space_factor` times the estimated size free
on the output disk (default `1.5`). `cli_timeout_seconds` defaults to 24 hours.
