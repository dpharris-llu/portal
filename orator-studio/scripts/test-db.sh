#!/usr/bin/env bash
# Applies every migration, then setup-all.sql twice, to a throwaway local
# Postgres with a stand-in for Supabase's auth and realtime schemas, and runs
# the knowledge-model access tests. Needs Postgres 16 binaries (initdb, pg_ctl).
# Usage: sudo scripts/test-db.sh   (runs Postgres as the postgres user)
set -euo pipefail
cd "$(dirname "$0")/.."
B=${PG_BIN:-/usr/lib/postgresql/16/bin}
D=$(su postgres -c 'mktemp -d')
trap 'su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
su postgres -c "$B/initdb -D $D/data -A trust -U postgres" >/dev/null
su postgres -c "$B/pg_ctl -D $D/data -o '-p 5499 -k $D' -l $D/pg.log start" >/dev/null
sleep 2
P="psql -h $D -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t"
$P -d t -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do $P -d t -f "$f" >/dev/null; done
echo "Migrations applied in order."
$P -c "create database t2"; $P -d t2 -f supabase/tests/supabase-stub.sql
$P -d t2 -f supabase/setup-all.sql >/dev/null && $P -d t2 -f supabase/setup-all.sql >/dev/null && echo "setup-all.sql applied twice."
$P -d t -c "insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','author@example.org'),('22222222-2222-2222-2222-222222222222','colleague@example.org'),('33333333-3333-3333-3333-333333333333','stranger@example.org')"
psql -h $D -p 5499 -U postgres -d t -q -f supabase/tests/knowledge-access.sql 2>&1 | grep -v '^ *$'
