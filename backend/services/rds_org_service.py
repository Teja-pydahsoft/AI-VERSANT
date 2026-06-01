"""
Read-only organization data from AWS RDS MySQL (student_database).

Maps RDS schema to AI-VERSANT API shapes:
  colleges      -> campuses
  courses       -> courses (per college)
  students.batch + college -> one batch per year (all courses & branches inside)
  students      -> student list (view-only)
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from utils.mysql_rds_manager import mysql_rds

logger = logging.getLogger(__name__)

# Avoid utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci errors when joining text columns
_COLLATE = 'utf8mb4_unicode_ci'

# Stable string IDs for the frontend (not Mongo ObjectIds)
CAMPUS_PREFIX = 'rds_c_'
COURSE_PREFIX = 'rds_co_'
BATCH_PREFIX = 'rds_b_'
STUDENT_PREFIX = 'rds_s_'


def campus_id(college_id: int) -> str:
    return f'{CAMPUS_PREFIX}{college_id}'


def parse_campus_id(value: str) -> Optional[int]:
    if not value:
        return None
    if value.startswith(CAMPUS_PREFIX):
        return int(value[len(CAMPUS_PREFIX):])
    if value.isdigit():
        return int(value)
    return None


def course_id(course_id_num: int) -> str:
    return f'{COURSE_PREFIX}{course_id_num}'


def parse_course_id(value: str) -> Optional[int]:
    if not value:
        return None
    if value.startswith(COURSE_PREFIX):
        return int(value[len(COURSE_PREFIX):])
    if value.isdigit():
        return int(value)
    return None


def batch_id(college_id: int, batch_year: str, course_id_num: Optional[int] = None) -> str:
    """One batch per college + year. Legacy 3-part ids kept for backward compatibility."""
    if course_id_num is not None:
        return f'{BATCH_PREFIX}{college_id}_{course_id_num}_{batch_year}'
    return f'{BATCH_PREFIX}{college_id}_{batch_year}'


def parse_batch_id(value: str) -> Optional[tuple[int, Optional[int], str]]:
    """
    Returns (college_id, course_id_or_none, batch_year).
    Supports rds_b_{college}_{year} and legacy rds_b_{college}_{course}_{year}.
    """
    if not value or not value.startswith(BATCH_PREFIX):
        return None
    parts = value[len(BATCH_PREFIX):].split('_')
    if len(parts) == 2:
        return int(parts[0]), None, parts[1]
    if len(parts) >= 3:
        batch_year = parts[-1]
        college_id = int(parts[0])
        if len(parts) == 3:
            try:
                return college_id, int(parts[1]), batch_year
            except ValueError:
                return None
    return None


def student_id(student_row_id: int) -> str:
    return f'{STUDENT_PREFIX}{student_row_id}'


def parse_student_id(value: str) -> Optional[int]:
    if not value:
        return None
    if value.startswith(STUDENT_PREFIX):
        return int(value[len(STUDENT_PREFIX):])
    return None


def _serialize_dt(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


class RDSOrgService:
    """Read-only queries against colleges, courses, and students tables."""

    def list_colleges(self, active_only: bool = True) -> list[dict]:
        sql = """
            SELECT id, name, code, is_active, created_at, updated_at
            FROM colleges
        """
        params: list = []
        if active_only:
            sql += ' WHERE is_active = 1'
        sql += ' ORDER BY name'
        with mysql_rds.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [
            {
                'id': campus_id(r['id']),
                'name': r['name'],
                'code': r.get('code'),
                'is_active': bool(r.get('is_active')),
                'created_at': _serialize_dt(r.get('created_at')),
                'source': 'rds',
            }
            for r in rows
        ]

    def get_college_by_id(self, college_id: int) -> Optional[dict]:
        with mysql_rds.cursor() as cur:
            cur.execute(
                'SELECT id, name, code, is_active, created_at FROM colleges WHERE id = %s',
                (college_id,),
            )
            r = cur.fetchone()
        if not r:
            return None
        return {
            'id': campus_id(r['id']),
            'name': r['name'],
            'code': r.get('code'),
            'source': 'rds',
        }

    def list_courses(self, college_id: Optional[int] = None, active_only: bool = True) -> list[dict]:
        sql = """
            SELECT co.id, co.college_id, co.name, co.code, co.level,
                   co.total_years, co.is_active, co.created_at,
                   c.name AS college_name
            FROM courses co
            JOIN colleges c ON c.id = co.college_id
            WHERE 1=1
        """
        params: list = []
        if active_only:
            sql += ' AND co.is_active = 1 AND c.is_active = 1'
        if college_id is not None:
            sql += ' AND co.college_id = %s'
            params.append(college_id)
        sql += ' ORDER BY c.name, co.name'
        with mysql_rds.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [
            {
                'id': course_id(r['id']),
                'name': r['name'],
                'code': r.get('code'),
                'level': r.get('level'),
                'total_years': r.get('total_years'),
                'campus_id': campus_id(r['college_id']),
                'campus': {'id': campus_id(r['college_id']), 'name': r['college_name']},
                'created_at': _serialize_dt(r.get('created_at')),
                'source': 'rds',
            }
            for r in rows
        ]

    def get_course_by_id(self, course_id_num: int) -> Optional[dict]:
        with mysql_rds.cursor() as cur:
            cur.execute(
                """
                SELECT co.id, co.college_id, co.name, co.code, c.name AS college_name
                FROM courses co
                JOIN colleges c ON c.id = co.college_id
                WHERE co.id = %s
                """,
                (course_id_num,),
            )
            r = cur.fetchone()
        if not r:
            return None
        return {
            'id': course_id(r['id']),
            'name': r['name'],
            'code': r.get('code'),
            'campus_id': campus_id(r['college_id']),
            'campus': {'id': campus_id(r['college_id']), 'name': r['college_name']},
            'source': 'rds',
        }

    def _college_name_for_id(self, college_id: int) -> Optional[str]:
        college = self.get_college_by_id(college_id)
        return college['name'] if college else None

    def _course_name_for_id(self, course_id_num: int) -> Optional[str]:
        course = self.get_course_by_id(course_id_num)
        return course['name'] if course else None

    def _fetch_batch_breakdown_rows(
        self,
        college_id: Optional[int] = None,
        course_id_num: Optional[int] = None,
        batch_year: Optional[str] = None,
    ) -> list[dict]:
        """Per college, batch year, course, and branch student counts."""
        sql = f"""
            SELECT
                c.id AS college_id,
                c.name AS college_name,
                s.batch AS batch_year,
                co.id AS course_id,
                co.name AS course_name,
                COALESCE(NULLIF(TRIM(s.branch), ''), 'General') AS branch_name,
                COUNT(*) AS student_count
            FROM students s
            INNER JOIN colleges c ON (
                c.name COLLATE {_COLLATE} = s.college COLLATE {_COLLATE}
                AND c.is_active = 1
            )
            LEFT JOIN courses co ON (
                co.college_id = c.id
                AND co.name COLLATE {_COLLATE} = s.course COLLATE {_COLLATE}
                AND co.is_active = 1
            )
            WHERE s.batch IS NOT NULL AND TRIM(s.batch) != ''
        """
        params: list = []
        if college_id is not None:
            sql += ' AND c.id = %s'
            params.append(college_id)
        if course_id_num is not None:
            sql += ' AND co.id = %s'
            params.append(course_id_num)
        if batch_year:
            sql += ' AND s.batch = %s'
            params.append(batch_year)
        sql += """
            GROUP BY c.id, c.name, s.batch, co.id, co.name, branch_name
            ORDER BY s.batch DESC, c.name, co.name, branch_name
        """
        with mysql_rds.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def _build_batches_from_rows(self, rows: list[dict]) -> list[dict]:
        """
        One batch per (college, course, admission year), e.g. '2026 B.Tech' at PCE.
        All branches (CSE, ECE, MEC, …) are grouped inside that single batch.
        """
        batches_map: dict[str, dict] = {}

        for r in rows:
            cid = r['college_id']
            year = r['batch_year']
            co_id = r.get('course_id')
            co_name = r.get('course_name') or 'Unmapped'
            branch_name = r.get('branch_name') or 'General'
            count = int(r['student_count'])

            co_key_part = str(co_id) if co_id is not None else co_name.replace(' ', '_')
            key = f'{cid}_{co_key_part}_{year}'

            if key not in batches_map:
                co_public_id = course_id(co_id) if co_id is not None else None
                display = f'{year} {co_name}'
                batches_map[key] = {
                    'id': batch_id(cid, year, co_id) if co_id is not None else batch_id(cid, year),
                    'name': display,
                    'display_name': display,
                    'batch_year': year,
                    'primary_course': co_name,
                    'student_count': 0,
                    'campuses': [{'id': campus_id(cid), 'name': r['college_name']}],
                    'campus_ids': [campus_id(cid)],
                    'courses': (
                        [{'id': co_public_id, 'name': co_name, 'student_count': 0, 'branches': []}]
                        if co_public_id
                        else [{'name': co_name, 'student_count': 0, 'branches': []}]
                    ),
                    'course_ids': [co_public_id] if co_public_id else [],
                    'branches': [],
                    'source': 'rds',
                }

            batch = batches_map[key]
            batch['student_count'] += count

            if batch['courses']:
                course_entry = batch['courses'][0]
                course_entry['student_count'] += count
                existing_branch = next(
                    (b for b in course_entry['branches'] if b['name'] == branch_name),
                    None,
                )
                if existing_branch:
                    existing_branch['student_count'] += count
                else:
                    course_entry['branches'].append({
                        'name': branch_name,
                        'student_count': count,
                    })

        result = []
        for batch in batches_map.values():
            for c in batch['courses']:
                c['branches'].sort(key=lambda b: (-b['student_count'], b['name']))
            batch['branches'] = batch['courses'][0]['branches'] if batch['courses'] else []
            result.append(batch)

        result.sort(
            key=lambda b: (
                -int(b['batch_year']) if str(b['batch_year']).isdigit() else 0,
                b.get('primary_course') or '',
                b['campuses'][0]['name'],
            )
        )
        return result

    def list_batches(
        self,
        college_id: Optional[int] = None,
        course_id_num: Optional[int] = None,
    ) -> list[dict]:
        """
        One batch per course + admission year (e.g. '2026 B.Tech' with CSE, ECE, MEC branches).
        """
        rows = self._fetch_batch_breakdown_rows(college_id=college_id, course_id_num=course_id_num)
        batches = self._build_batches_from_rows(rows)

        if course_id_num is not None:
            co_public = course_id(course_id_num)
            batches = [b for b in batches if co_public in b.get('course_ids', [])]

        return batches

    def get_batch_by_composite(
        self,
        college_id: int,
        batch_year: str,
        course_id_num: Optional[int] = None,
    ) -> Optional[dict]:
        rows = self._fetch_batch_breakdown_rows(
            college_id=college_id,
            course_id_num=course_id_num,
            batch_year=batch_year,
        )
        batches = self._build_batches_from_rows(rows)
        for b in batches:
            if b['batch_year'] == batch_year:
                if course_id_num is None:
                    return b
                if course_id(course_id_num) in b.get('course_ids', []):
                    return b
        bid = batch_id(college_id, batch_year, course_id_num)
        return {
            'id': bid,
            'name': f'{batch_year}' + (f' (course {course_id_num})' if course_id_num else ''),
            'display_name': f'{batch_year}',
            'batch_year': batch_year,
            'student_count': 0,
            'campuses': [],
            'courses': [],
            'branches': [],
            'source': 'rds',
        }

    def count_all_students(self) -> int:
        with mysql_rds.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS c FROM students')
            return int(cur.fetchone()['c'])

    def count_students_for_college(self, college_id: int) -> int:
        name = self._college_name_for_id(college_id)
        if not name:
            return 0
        with mysql_rds.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS c FROM students WHERE college = %s', (name,))
            return int(cur.fetchone()['c'])

    def count_students_for_course(self, course_id_num: int, college_id: Optional[int] = None) -> int:
        course_name = self._course_name_for_id(course_id_num)
        if not course_name:
            return 0
        sql = 'SELECT COUNT(*) AS c FROM students WHERE course = %s'
        params: list = [course_name]
        if college_id is not None:
            college_name = self._college_name_for_id(college_id)
            if college_name:
                sql += ' AND college = %s'
                params.append(college_name)
        with mysql_rds.cursor() as cur:
            cur.execute(sql, params)
            return int(cur.fetchone()['c'])

    def count_courses_for_college(self, college_id: int) -> int:
        with mysql_rds.cursor() as cur:
            cur.execute(
                'SELECT COUNT(*) AS c FROM courses WHERE college_id = %s AND is_active = 1',
                (college_id,),
            )
            return int(cur.fetchone()['c'])

    def list_students(
        self,
        page: int = 1,
        limit: int = 20,
        search: str = '',
        college_id: Optional[int] = None,
        course_id_num: Optional[int] = None,
        batch_year: Optional[str] = None,
        branch: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        conditions = ['1=1']
        params: list = []

        if college_id is not None:
            college_name = self._college_name_for_id(college_id)
            if college_name:
                conditions.append('s.college = %s')
                params.append(college_name)

        if course_id_num is not None:
            course_name = self._course_name_for_id(course_id_num)
            if course_name:
                conditions.append('s.course = %s')
                params.append(course_name)

        if batch_year:
            conditions.append('s.batch = %s')
            params.append(batch_year)

        if branch:
            conditions.append('s.branch = %s')
            params.append(branch)

        if status_filter:
            conditions.append('s.student_status = %s')
            params.append(status_filter)

        if search:
            like = f'%{search}%'
            conditions.append(
                '(s.student_name LIKE %s OR s.admission_number LIKE %s OR s.email LIKE %s '
                'OR s.student_mobile LIKE %s)'
            )
            params.extend([like, like, like, like])

        where = ' AND '.join(conditions)
        count_sql = f'SELECT COUNT(*) AS total FROM students s WHERE {where}'
        data_sql = self._STUDENT_SELECT + f"""
            WHERE {where}
            ORDER BY s.student_name
            LIMIT %s OFFSET %s
        """
        offset = (page - 1) * limit

        with mysql_rds.cursor() as cur:
            cur.execute(count_sql, params)
            total = int(cur.fetchone()['total'])
            cur.execute(data_sql, params + [limit, offset])
            rows = cur.fetchall()

        students = [self._student_row_to_dict(r) for r in rows]
        return students, total

    _STUDENT_SELECT = f"""
        SELECT
            s.id, s.admission_number, s.admission_no, s.pin_no,
            s.student_name, s.email, s.student_mobile, s.parent_mobile1,
            s.branch, s.batch, s.college, s.course, s.student_status,
            s.gender, s.current_year, s.current_semester, s.father_name,
            s.created_at, s.updated_at,
            c.id AS college_id,
            co.id AS course_id
        FROM students s
        LEFT JOIN colleges c ON c.name COLLATE {_COLLATE} = s.college COLLATE {_COLLATE}
        LEFT JOIN courses co ON (
            co.college_id = c.id
            AND co.name COLLATE {_COLLATE} = s.course COLLATE {_COLLATE}
        )
    """

    def _student_row_to_dict(self, r: dict) -> dict:
        cid = r.get('college_id')
        coid = r.get('course_id')
        bid = (
            batch_id(cid, r['batch'], coid)
            if cid and coid and r.get('batch')
            else (batch_id(cid, r['batch']) if cid and r.get('batch') else None)
        )
        pin = (r.get('pin_no') or '').strip()
        admission = (r.get('admission_number') or r.get('admission_no') or '').strip()
        return {
            '_id': student_id(r['id']),
            'student_id': student_id(r['id']),
            'rds_student_id': r['id'],
            'name': r.get('student_name') or '',
            'email': r.get('email') or '',
            'pin_no': pin,
            'admission_number': admission,
            'roll_number': pin or admission,
            'mobile_number': r.get('student_mobile') or '',
            'parent_mobile': r.get('parent_mobile1') or '',
            'branch': r.get('branch') or '',
            'batch_name': r.get('batch') or '',
            'batch_id': bid,
            'campus_name': r.get('college') or '',
            'campus_id': campus_id(cid) if cid else None,
            'course_name': r.get('course') or '',
            'course_id': course_id(coid) if coid else None,
            'student_status': r.get('student_status'),
            'gender': r.get('gender'),
            'current_year': r.get('current_year'),
            'current_semester': r.get('current_semester'),
            'father_name': r.get('father_name'),
            'is_active': (r.get('student_status') or '').lower() in ('regular', 're-joined', 'rejoined', 'lateral'),
            'created_at': _serialize_dt(r.get('created_at')),
            'source': 'rds',
            'read_only': True,
        }

    def get_student_by_identifier(self, identifier: str) -> Optional[dict]:
        """Lookup by pin_no, admission_number, or admission_no."""
        ident = str(identifier or '').strip()
        if not ident:
            return None
        sql = self._STUDENT_SELECT + """
            WHERE s.pin_no = %s OR s.admission_number = %s OR s.admission_no = %s
            LIMIT 1
        """
        with mysql_rds.cursor() as cur:
            cur.execute(sql, (ident, ident, ident))
            row = cur.fetchone()
        return self._student_row_to_dict(row) if row else None

    def build_pin_lookup_map(self) -> dict[str, dict]:
        """Build uppercase pin_no -> student dict map for bulk sync."""
        sql = self._STUDENT_SELECT + ' WHERE s.pin_no IS NOT NULL AND s.pin_no != ""'
        result: dict[str, dict] = {}
        with mysql_rds.cursor() as cur:
            cur.execute(sql)
            for row in cur.fetchall():
                student = self._student_row_to_dict(row)
                pin = (student.get('pin_no') or '').strip().upper()
                if pin:
                    result[pin] = student
        return result

    def get_student_by_id(self, student_row_id: int) -> Optional[dict]:
        sql = self._STUDENT_SELECT + ' WHERE s.id = %s LIMIT 1'
        with mysql_rds.cursor() as cur:
            cur.execute(sql, (student_row_id,))
            row = cur.fetchone()
        return self._student_row_to_dict(row) if row else None

    def list_branches_for_course(self, course_id_num: int) -> list[dict]:
        with mysql_rds.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, code FROM course_branches
                WHERE course_id = %s AND is_active = 1
                ORDER BY name
                """,
                (course_id_num,),
            )
            rows = cur.fetchall()
        return [
            {'id': str(r['id']), 'name': r['name'], 'code': r.get('code'), 'source': 'rds'}
            for r in rows
        ]

    def list_branches_for_college(
        self,
        college_id: int,
        batch_year: Optional[str] = None,
        course_id_num: Optional[int] = None,
    ) -> list[dict]:
        """Distinct branches from enrolled students at a college (for filter dropdowns)."""
        college_name = self._college_name_for_id(college_id)
        if not college_name:
            return []

        sql = f"""
            SELECT
                COALESCE(NULLIF(TRIM(s.branch), ''), 'General') AS name,
                COUNT(*) AS student_count
            FROM students s
            WHERE s.college = %s
        """
        params: list = [college_name]

        if batch_year:
            sql += ' AND s.batch = %s'
            params.append(batch_year)

        if course_id_num is not None:
            course_name = self._course_name_for_id(course_id_num)
            if course_name:
                sql += ' AND s.course = %s'
                params.append(course_name)

        sql += ' GROUP BY name ORDER BY name'

        with mysql_rds.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        return [
            {'id': r['name'], 'name': r['name'], 'student_count': int(r['student_count']), 'source': 'rds'}
            for r in rows
        ]


rds_org = RDSOrgService()
