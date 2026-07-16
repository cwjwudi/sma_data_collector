# SD SMA DB Admin

Standalone database administration web tool for SD SMA runtime packages.

Default URL when launched through `_Launcher`:

- `http://127.0.0.1:8093/admin`

Main functions:

- Test MySQL connection.
- List databases and tables.
- Create MySQL SQL backups through `mysqldump` / `mariadb-dump`.
- Restore SQL files through `mysql` / `mariadb`.
- Export a table to CSV.
- Import CSV into an existing table.

Large backup safeguards:

- SQL dumps are written to a `.partial` file and atomically renamed only after success.
- Each completed SQL dump has a SHA-256 manifest (`.sql.manifest.json`).
- Backup names include microseconds to prevent same-second collisions.
- Free disk space is checked before `mysqldump` starts.
- Downloads support HTTP byte ranges (`206 Partial Content`) for resume-capable clients.
- Destructive uploads require a short-lived, operation-bound, single-use confirmation token.
- State-changing browser requests from a different Origin are rejected.
- Running background jobs are bounded by `max_concurrent_jobs`.
- Running external database commands and CSV loops can be cancelled from the job list.
- Completed server-side SQL backups can be restored directly after manifest and SHA-256 verification;
  large files do not need to be uploaded through the browser again.

## MySQL / MariaDB client tools

SQL backup and restore need MySQL or MariaDB client tools. Resolution order:

1. Absolute paths in `mysql_tools` inside `config/default.json`
2. Tools available on `PATH` (`mysqldump` / `mysql`, or `mariadb-dump` / `mariadb`)
3. Binaries under the project `_tools` directory

If no client is found, the job fails with a clear message
(`找不到 MySQL/MariaDB 客户端工具: ...`) instead of a raw `WinError 2`.

MySQL 8 dump clients automatically receive `--column-statistics=0` so they work
against MariaDB servers that do not expose `information_schema.COLUMN_STATISTICS`.
MariaDB dump clients do not receive that flag.

## Export directories

- The default export directory is `backup_dir` (usually `config/backups`).
- Any writable absolute folder may be selected as the export directory.
- The last chosen directory is remembered in the browser (`localStorage`) and on the
  server as `last_output_dir` in `config/default.json`.
- Completed backups are listed / downloaded / restored from `backup_dir` and
  `last_output_dir` together.

Database passwords are never returned by `/api/config`; enter them for the current
browser session or inject them through an external credential mechanism.

For large backups, keep at least `backup_free_space_factor` times the database's
reported data-and-index size available on the output disk. The default factor is `1.5`.
`cli_timeout_seconds` defaults to 24 hours.
