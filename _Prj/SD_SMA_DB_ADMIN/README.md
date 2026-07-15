# SD SMA DB Admin

Standalone database administration web tool for SD SMA runtime packages.

Default URL when launched through `_Launcher`:

- `http://127.0.0.1:8093/admin`

Main functions:

- Test MySQL connection.
- List databases and tables.
- Create MySQL SQL backups through `mysqldump`.
- Restore SQL files through `mysql`.
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

SQL backup and restore need MySQL client tools available in `PATH`, or explicit paths in
`config/default.json`.

The configured export directory must be the backup directory itself or one of its
subdirectories. Database passwords are never returned by `/api/config`; enter them for
the current browser session or inject them through an external credential mechanism.

For large backups, keep at least `backup_free_space_factor` times the database's
reported data-and-index size available on the output disk. The default factor is `1.5`.
`cli_timeout_seconds` defaults to 24 hours.

