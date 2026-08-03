#!/bin/sh
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"

# ทุกครั้งที่ container เปิด ถ้ามี data อยู่แล้ว — restore LOGIN + schema grants
# ป้องกัน postgres NOLOGIN จาก dirty shutdown
if [ -f "$PGDATA/PG_VERSION" ]; then
  echo "[startup] Restoring postgres role permissions..."
  printf 'ALTER ROLE postgres LOGIN;\nGRANT ALL ON SCHEMA public TO postgres;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;\n' \
    | gosu postgres postgres --single -D "$PGDATA" line_sender
  echo "[startup] Done."
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
