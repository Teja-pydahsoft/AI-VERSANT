"""Facade: route organization reads to RDS or Mongo based on configuration."""
import logging
from flask import jsonify
from bson import ObjectId

from config.mysql_rds import MySQLRDSConfig
from mongo import mongo_db
from services.rds_org_service import (
    rds_org,
    parse_batch_id,
    parse_campus_id,
    parse_course_id,
    parse_student_id,
)

logger = logging.getLogger(__name__)

READ_ONLY_MESSAGE = (
    'Organization data is sourced from the master student database (AWS RDS) and is read-only. '
    'Create or edit campuses, courses, batches, and students in the student management system.'
)


def use_rds() -> bool:
    return MySQLRDSConfig.use_rds_org_data()


def read_only_response(status_code: int = 403):
    return jsonify({'success': False, 'message': READ_ONLY_MESSAGE, 'read_only': True}), status_code


def resolve_campus_id(campus_id: str):
    if use_rds():
        return parse_campus_id(campus_id)
    return campus_id


def resolve_course_id(course_id: str):
    if use_rds():
        return parse_course_id(course_id)
    return course_id


def resolve_batch_filters(batch_id: str):
    if use_rds():
        return parse_batch_id(batch_id)
    return None


def resolve_student_id(student_id: str):
    if use_rds():
        return parse_student_id(student_id)
    return student_id


def resolve_user_college_id(user) -> int | None:
    """Map a Mongo user campus_id to RDS college id (by id or campus name)."""
    if not use_rds():
        return user.get('campus_id')
    campus_id = user.get('campus_id')
    if not campus_id:
        return None
    college_id = parse_campus_id(str(campus_id))
    if college_id is not None:
        return college_id
    try:
        campus = mongo_db.campuses.find_one({'_id': ObjectId(campus_id)})
        if campus and campus.get('name'):
            for college in rds_org.list_colleges(active_only=False):
                if college['name'] == campus['name']:
                    return parse_campus_id(college['id'])
    except Exception:
        pass
    return None


def resolve_user_course_id(user) -> int | None:
    """Map a Mongo user course_id to RDS course id (by id or course name)."""
    if not use_rds():
        return user.get('course_id')
    course_id = user.get('course_id')
    if not course_id:
        return None
    course_num = parse_course_id(str(course_id))
    if course_num is not None:
        return course_num
    try:
        course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
        if course and course.get('name'):
            college_id = resolve_user_college_id(user)
            for c in rds_org.list_courses(college_id=college_id, active_only=False):
                if c['name'] == course['name']:
                    return parse_course_id(c['id'])
            for c in rds_org.list_courses(active_only=False):
                if c['name'] == course['name']:
                    return parse_course_id(c['id'])
    except Exception:
        pass
    return None


def org_meta() -> dict:
    """Extra JSON fields for API responses when RDS is the org source."""
    if use_rds():
        return {'source': 'rds', 'read_only': True}
    return {}


def is_rds_org_id(value) -> bool:
    s = str(value or '')
    return s.startswith('rds_')


def normalize_test_org_id(value):
    """Store Mongo ObjectId or RDS string id in test documents."""
    if value is None:
        return None
    s = str(value)
    if is_rds_org_id(s):
        return s
    try:
        return ObjectId(s)
    except Exception:
        return s


def normalize_test_org_ids(values):
    return [normalize_test_org_id(v) for v in (values or []) if v]


def derive_rds_course_ids_from_batches(batch_ids):
    """Infer RDS course ids from batch ids (rds_b_{college}_{course}_{year})."""
    from services.rds_org_service import course_id as rds_course_id

    seen = set()
    result = []
    for bid in batch_ids or []:
        parsed = parse_batch_id(str(bid))
        if not parsed:
            continue
        _, course_num, _ = parsed
        if course_num is None:
            continue
        cid = rds_course_id(course_num)
        if cid not in seen:
            seen.add(cid)
            result.append(cid)
    return result


def _normalize_test_id_list(ids, single_id=None):
    result = []
    for value in ids or []:
        if value is not None and str(value).strip():
            result.append(value)
    if not result and single_id is not None and str(single_id).strip():
        result.append(single_id)
    return result


def _collect_mongo_object_ids(values):
    oids = []
    seen = set()
    for value in values:
        if is_rds_org_id(value):
            continue
        try:
            oid = ObjectId(str(value))
            key = str(oid)
            if key not in seen:
                seen.add(key)
                oids.append(oid)
        except Exception:
            continue
    return oids


def build_org_name_maps(tests: list) -> dict:
    """Build campus/batch/course id -> name maps from Mongo and RDS for test list display."""
    campus_values = []
    batch_values = []
    course_values = []

    for test in tests or []:
        campus_values.extend(_normalize_test_id_list(test.get('campus_ids'), test.get('campus_id')))
        batch_values.extend(test.get('batch_ids') or [])
        course_values.extend(test.get('course_ids') or [])

    maps = {'campus': {}, 'batch': {}, 'course': {}}

    campus_oids = _collect_mongo_object_ids(campus_values)
    batch_oids = _collect_mongo_object_ids(batch_values)
    course_oids = _collect_mongo_object_ids(course_values)

    if campus_oids:
        for doc in mongo_db.campuses.find({'_id': {'$in': campus_oids}}, {'name': 1}):
            maps['campus'][str(doc['_id'])] = doc.get('name') or ''

    if batch_oids:
        for doc in mongo_db.batches.find({'_id': {'$in': batch_oids}}, {'name': 1}):
            maps['batch'][str(doc['_id'])] = doc.get('name') or ''

    if course_oids:
        for doc in mongo_db.courses.find({'_id': {'$in': course_oids}}, {'name': 1}):
            maps['course'][str(doc['_id'])] = doc.get('name') or ''

    if MySQLRDSConfig.is_configured() and (
        use_rds() or any(is_rds_org_id(v) for v in campus_values + batch_values + course_values)
    ):
        try:
            for college in rds_org.list_colleges(active_only=False):
                maps['campus'][college['id']] = college['name']
            for course in rds_org.list_courses(active_only=False):
                maps['course'][course['id']] = course['name']
            for batch in rds_org.list_batches():
                maps['batch'][batch['id']] = batch['name']
        except Exception as exc:
            logger.warning('Failed to load RDS org name maps for tests: %s', exc)

    return maps


def _resolve_id_list_to_names(ids, name_map):
    names = []
    seen = set()
    for value in ids or []:
        name = name_map.get(str(value), '').strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def apply_test_audience_labels(test: dict, name_maps: dict) -> dict:
    """Set campus, batches, courses, and branches display strings on a test dict."""
    campus_ids = _normalize_test_id_list(test.get('campus_ids'), test.get('campus_id'))
    batch_ids = test.get('batch_ids') or []
    course_ids = test.get('course_ids') or []
    branch_names = [
        str(name).strip()
        for name in (test.get('branch_names') or [])
        if str(name).strip()
    ]

    campus_names = _resolve_id_list_to_names(campus_ids, name_maps['campus'])
    batch_names = _resolve_id_list_to_names(batch_ids, name_maps['batch'])
    course_names = _resolve_id_list_to_names(course_ids, name_maps['course'])

    if not campus_names and test.get('campus_names'):
        campus_names = [n for n in test.get('campus_names') or [] if n]
    if not batch_names and isinstance(test.get('batches'), list):
        batch_names = [n for n in test.get('batches') or [] if n]
    if not course_names and isinstance(test.get('courses'), list):
        course_names = [n for n in test.get('courses') or [] if n]

    test['campus'] = ', '.join(campus_names) if campus_names else 'N/A'
    test['batches'] = ', '.join(batch_names) if batch_names else 'N/A'
    test['courses'] = ', '.join(course_names) if course_names else 'N/A'
    test['branches'] = ', '.join(branch_names) if branch_names else 'N/A'
    return test
