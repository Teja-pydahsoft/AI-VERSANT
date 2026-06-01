#!/usr/bin/env python3
"""Find students that appear under 'Unmapped' batches and explain why."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

_backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(os.path.dirname(_backend), '.env'))

from utils.mysql_rds_manager import mysql_rds

_COLLATE = 'utf8mb4_unicode_ci'


def main():
    batch_year = sys.argv[1] if len(sys.argv) > 1 else '2026'

    sql = f"""
        SELECT s.id, s.admission_number, s.student_name, s.college, s.course, s.branch, s.batch,
               s.student_status, c.id AS college_id, c.name AS college_name
        FROM students s
        INNER JOIN colleges c ON c.name COLLATE {_COLLATE} = s.college COLLATE {_COLLATE}
        LEFT JOIN courses co ON (
            co.college_id = c.id
            AND co.name COLLATE {_COLLATE} = s.course COLLATE {_COLLATE}
            AND co.is_active = 1
        )
        WHERE s.batch = %s AND co.id IS NULL
        ORDER BY s.college, s.course, s.branch
    """
    with mysql_rds.cursor() as cur:
        cur.execute(sql, (batch_year,))
        rows = cur.fetchall()

    print(f"Unmapped {batch_year} students (course text does not match courses table): {len(rows)}\n")

    for r in rows:
        print("---")
        print(f"  ID: {r['id']}")
        print(f"  Name: {r['student_name']}")
        print(f"  Admission: {r['admission_number']}")
        print(f"  College: {r['college']}")
        print(f"  Course field in students table: [{r['course']!r}]")
        print(f"  Branch: {r['branch']}")
        print(f"  Status: {r['student_status']}")

        college_id = r['college_id']
        course_text = (r['course'] or '').strip()
        with mysql_rds.cursor() as cur:
            cur.execute(
                'SELECT id, name, code FROM courses WHERE college_id = %s AND is_active = 1 ORDER BY name',
                (college_id,),
            )
            available = cur.fetchall()

        print("  Available courses at this college:")
        for c in available:
            match = " <-- EXACT MATCH" if c['name'] == course_text else ""
            similar = ""
            if course_text and course_text.lower() in (c['name'] or '').lower():
                similar = " (partial)"
            print(f"    - {c['name']} (id={c['id']}, code={c['code']}){match}{similar}")

        if not course_text:
            print("  REASON: course column is NULL or empty in students table")
        elif not any(c['name'] == course_text for c in available):
            print(f"  REASON: no course named exactly {course_text!r} in courses table for this college")
        print()


if __name__ == '__main__':
    main()
