#!/usr/bin/env python3
"""
Explore AWS RDS MySQL schema for AI-VERSANT organization data integration.

Usage (from backend/):
  python scripts/explore_rds_schema.py

Requires DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in environment or .env
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

_backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = os.path.dirname(_backend)
load_dotenv(os.path.join(_project_root, '.env'))
load_dotenv(os.path.join(_backend, '.env'))

from config.mysql_rds import MySQLRDSConfig
from utils.mysql_rds_manager import mysql_rds
from services.rds_org_service import rds_org


def main():
    if not MySQLRDSConfig.is_configured():
        print('ERROR: Set DB_HOST, DB_USER, DB_NAME (and DB_PASSWORD) in .env')
        sys.exit(1)

    print('RDS health:', json.dumps(mysql_rds.health_check(), indent=2))
    print()

    with mysql_rds.cursor() as cur:
        cur.execute('SHOW TABLES')
        tables = sorted(r['Tables_in_' + MySQLRDSConfig.DATABASE] if isinstance(r, dict) else list(r.values())[0]
                        for r in cur.fetchall())
    print(f'Tables ({len(tables)}):', ', '.join(tables[:20]), '...' if len(tables) > 20 else '')
    print()

    for name in ('colleges', 'courses', 'course_branches', 'students', 'batch_regulations'):
        with mysql_rds.cursor() as cur:
            cur.execute(f'DESCRIBE `{name}`')
            cols = cur.fetchall()
            cur.execute(f'SELECT COUNT(*) AS c FROM `{name}`')
            count = cur.fetchone()['c']
        print(f'--- {name} ({count} rows) ---')
        for c in cols:
            print(f"  {c['Field']:30} {c['Type']}")
        print()

    colleges = rds_org.list_colleges()
    print(f'Colleges (active): {len(colleges)}')
    for c in colleges[:5]:
        print(f"  {c['id']}: {c['name']}")

    courses = rds_org.list_courses()
    print(f'\nCourses (active): {len(courses)}')

    batches = rds_org.list_batches()
    print(f'Batches (derived): {len(batches)}')
    for b in batches[:5]:
        print(f"  {b['id']}: {b['name']} ({b['student_count']} students)")

    students, total = rds_org.list_students(page=1, limit=3)
    print(f'\nStudents total: {total}')
    for s in students:
        print(f"  {s['roll_number']}: {s['name']} | {s['campus_name']} / {s['course_name']} / {s['batch_name']}")

    print('\nWrite test (should fail when MYSQL_RDS_READ_ONLY=true):')
    try:
        with mysql_rds.cursor() as cur:
            cur.execute('CREATE TABLE _versant_readonly_probe (id INT)')
        print('  WARNING: write allowed — use a read-only DB user in production')
    except PermissionError as e:
        print(f'  OK: {e}')


if __name__ == '__main__':
    main()
