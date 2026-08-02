#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: deploy/backup.sh <existing-backup-directory>" >&2
  exit 2
fi

backup_dir=$1
if [ ! -d "$backup_dir" ]; then
  echo "Backup directory must already exist: $backup_dir" >&2
  exit 2
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output="$backup_dir/workflow-$timestamp.dump"
umask 077
docker compose exec -T db pg_dump --username workflow --dbname workflow --format custom > "$output"
test -s "$output"
chmod 600 "$output"
echo "$output"
