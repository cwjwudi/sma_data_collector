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

SQL backup and restore need MySQL client tools available in `PATH`, or explicit paths in
`config/default.json`.

