#!/usr/bin/env python3
"""
Link MongoDB students to AWS RDS records and optionally provision missing accounts.

Usage (from backend/):
  python scripts/sync_rds_students.py              # dry run
  python scripts/sync_rds_students.py --apply      # link existing students
  python scripts/sync_rds_students.py --apply --provision  # also create Mongo users for unmapped RDS students
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

_backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = os.path.dirname(_backend)
load_dotenv(os.path.join(_project_root, '.env'))
load_dotenv(os.path.join(_backend, '.env'))

from services.student_mapping_service import sync_all_students


def main():
    parser = argparse.ArgumentParser(description='Sync Mongo students with RDS master database')
    parser.add_argument('--apply', action='store_true', help='Apply changes (default is dry run)')
    parser.add_argument('--provision', action='store_true', help='Provision Mongo accounts for RDS students without a match')
    parser.add_argument('--no-profile-update', action='store_true', help='Only set mapping fields, do not refresh name/email/mobile')
    args = parser.parse_args()

    stats = sync_all_students(
        dry_run=not args.apply,
        provision_missing=args.provision,
        update_profile=not args.no_profile_update,
    )
    print(json.dumps(stats, indent=2, default=str))

    if stats.get('errors'):
        sys.exit(1)


if __name__ == '__main__':
    main()
