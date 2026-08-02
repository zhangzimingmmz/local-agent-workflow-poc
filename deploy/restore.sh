#!/bin/sh
set -eu

if [ "$#" -ne 2 ] || [ "$2" != "--confirm-replace-workflow-database" ]; then
  echo "Usage: deploy/restore.sh <backup.dump> --confirm-replace-workflow-database" >&2
  exit 2
fi

backup_file=$1
if [ ! -f "$backup_file" ] || [ ! -s "$backup_file" ]; then
  echo "Backup file is missing or empty: $backup_file" >&2
  exit 2
fi

docker compose stop app
if docker compose exec -T db pg_restore \
  --username workflow --dbname workflow --clean --if-exists --no-owner --no-privileges < "$backup_file"; then
  docker compose start app
  echo "Restore completed from $backup_file"
else
  docker compose start app
  echo "Restore failed; the application was restarted for inspection." >&2
  exit 1
fi
