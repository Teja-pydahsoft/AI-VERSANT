"""
Map MongoDB students to AWS RDS master database records.

Match keys (in order):
  - pin_no        (Mongo roll_number / username for most students)
  - admission_number / admission_no
  - rds_student_id (students.id)
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Optional

import pytz
from bson import ObjectId

from config.mysql_rds import MySQLRDSConfig
from config.shared import bcrypt
from mongo import mongo_db
from services.rds_org_service import rds_org, student_id as rds_public_student_id

logger = logging.getLogger(__name__)


def generate_student_password(student_name: str, roll_number: str) -> str:
    """
    Default password for RDS-provisioned students is their roll number / pin itself.
    This lets students log in with their roll number as both username and password.
    """
    return roll_number or '0000'


def _normalize_identifier(value: str) -> str:
    return str(value or '').strip()


def find_mongo_student_by_identifier(identifier: str) -> Optional[dict]:
    ident = _normalize_identifier(identifier)
    if not ident:
        return None

    for field in ('roll_number', 'pin_no', 'admission_number'):
        student = mongo_db.students.find_one({field: {'$regex': f'^{re.escape(ident)}$', '$options': 'i'}})
        if student:
            return student

    if ident.isdigit():
        student = mongo_db.students.find_one({'rds_student_id': int(ident)})
        if student:
            return student

    return None


def find_mongo_user_for_student(student: dict) -> Optional[dict]:
    user_id = student.get('user_id')
    if not user_id:
        return None
    return mongo_db.users.find_one({'_id': user_id})


def find_rds_student(identifier: str) -> Optional[dict]:
    if not MySQLRDSConfig.is_configured():
        return None
    return rds_org.get_student_by_identifier(identifier)


def _org_update_from_rds(rds_student: dict) -> dict:
    update: dict[str, Any] = {}
    for key in ('campus_id', 'course_id', 'batch_id'):
        if rds_student.get(key):
            update[key] = rds_student[key]
    if rds_student.get('branch'):
        update['branch'] = rds_student['branch']
    return update


def _student_link_fields(rds_student: dict) -> dict:
    rds_row_id = rds_student.get('rds_student_id') or rds_student.get('_rds_id')
    return {
        'rds_student_id': rds_row_id,
        'rds_public_id': rds_student.get('student_id') or rds_public_student_id(rds_row_id),
        'pin_no': rds_student.get('pin_no') or '',
        'admission_number': rds_student.get('admission_number') or rds_student.get('roll_number') or '',
        'provisioned_from': 'rds',
        'last_rds_sync_at': datetime.now(pytz.utc),
    }


def link_student_to_rds(
    mongo_student: dict,
    rds_student: dict,
    *,
    update_profile: bool = True,
) -> dict:
    """Link an existing Mongo student to RDS and optionally refresh profile/org fields."""
    student_updates = _student_link_fields(rds_student)
    student_updates.update(_org_update_from_rds(rds_student))

    if update_profile:
        for field in ('name', 'email', 'mobile_number'):
            if rds_student.get(field):
                student_updates[field] = rds_student[field]
        if rds_student.get('parent_mobile'):
            student_updates['parent_mobile'] = rds_student['parent_mobile']
        # Only update is_active when student_status is explicitly set in RDS;
        # never deactivate a student due to a missing/empty status value.
        if rds_student.get('student_status') and 'is_active' in rds_student:
            student_updates['is_active'] = rds_student['is_active']

    mongo_db.students.update_one({'_id': mongo_student['_id']}, {'$set': student_updates})

    user_updates: dict[str, Any] = {
        'last_rds_sync_at': datetime.now(pytz.utc),
        **_org_update_from_rds(rds_student),
    }
    if update_profile:
        if rds_student.get('name'):
            user_updates['name'] = rds_student['name']
        if rds_student.get('email'):
            user_updates['email'] = rds_student['email']
        if rds_student.get('mobile_number'):
            user_updates['mobile_number'] = rds_student['mobile_number']
        # Only update is_active when student_status is explicitly set in RDS.
        if rds_student.get('student_status') and 'is_active' in rds_student:
            user_updates['is_active'] = rds_student['is_active']

    mongo_db.users.update_one({'_id': mongo_student['user_id']}, {'$set': user_updates})

    return mongo_db.students.find_one({'_id': mongo_student['_id']})


def provision_from_rds(rds_student: dict) -> tuple[dict, dict]:
    """Create Mongo user + student from an RDS record."""
    pin = rds_student.get('pin_no') or ''
    admission = rds_student.get('admission_number') or rds_student.get('roll_number') or ''
    roll_number = pin or admission
    if not roll_number:
        raise ValueError('RDS student has no pin_no or admission_number')

    existing = find_mongo_student_by_identifier(roll_number)
    if existing:
        linked = link_student_to_rds(existing, rds_student)
        user = find_mongo_user_for_student(linked)
        return user, linked

    name = rds_student.get('name') or 'Student'
    password = generate_student_password(name, roll_number)
    password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    now = datetime.now(pytz.utc)

    user_doc = {
        'username': roll_number,
        'email': rds_student.get('email') or None,
        'password_hash': password_hash,
        'role': 'student',
        'name': name,
        'mobile_number': rds_student.get('mobile_number') or '',
        # Default to True if 'is_active' key is absent or student_status is unknown/unset
        'is_active': rds_student.get('is_active', True) if rds_student.get('student_status') else True,
        'created_at': now,
        'provisioned_from': 'rds',
        'last_rds_sync_at': now,
        'mfa_enabled': False,
        **_org_update_from_rds(rds_student),
    }

    user_result = mongo_db.users.insert_one(user_doc)
    user_id = user_result.inserted_id

    try:
        from models_notification_preferences import NotificationPreferences
        NotificationPreferences.create_default_preferences(user_id)
    except Exception as exc:
        logger.warning('Could not create notification preferences for %s: %s', user_id, exc)

    student_doc = {
        'user_id': user_id,
        'name': name,
        'roll_number': roll_number,
        'email': rds_student.get('email') or None,
        'mobile_number': rds_student.get('mobile_number') or '',
        'created_at': now,
        **_student_link_fields(rds_student),
        **_org_update_from_rds(rds_student),
    }

    student_result = mongo_db.students.insert_one(student_doc)
    user = mongo_db.users.find_one({'_id': user_id})
    student = mongo_db.students.find_one({'_id': student_result.inserted_id})
    return user, student


def resolve_login_user(identifier: str) -> Optional[dict]:
    """
    Resolve a login identifier to a Mongo user.
    Tries Mongo first, then RDS lookup + link/provision.
    """
    ident = _normalize_identifier(identifier)
    if not ident:
        return None

    user = mongo_db.find_user_by_username(ident)
    if not user:
        user = mongo_db.users.find_one({'email': ident})
    if not user:
        user = mongo_db.users.find_one({'mobile_number': ident})
    if user:
        return user

    if not MySQLRDSConfig.is_configured():
        return None

    rds_student = find_rds_student(ident)
    if not rds_student:
        return None

    pin = rds_student.get('pin_no') or ''
    admission = rds_student.get('admission_number') or rds_student.get('roll_number') or ''
    for lookup in (pin, admission, ident):
        if not lookup:
            continue
        mongo_student = find_mongo_student_by_identifier(lookup)
        if mongo_student:
            link_student_to_rds(mongo_student, rds_student, update_profile=True)
            return find_mongo_user_for_student(mongo_student)

    user, _student = provision_from_rds(rds_student)
    return user


def enrich_student_profile(user: dict, student: Optional[dict] = None) -> dict:
    """Merge live RDS org/profile fields into a student profile dict."""
    profile = {
        'name': user.get('name'),
        'email': user.get('email'),
        'role': user.get('role'),
        'mobile_number': user.get('mobile_number'),
        'roll_number': student.get('roll_number') if student else None,
        'pin_no': student.get('pin_no') if student else None,
        'admission_number': student.get('admission_number') if student else None,
        'branch': student.get('branch') if student else None,
        'campus': None,
        'course': None,
        'batch': None,
        'source': 'mongo',
    }

    if not student or not MySQLRDSConfig.is_configured():
        return profile

    rds_student = None
    if student.get('rds_student_id'):
        rds_student = rds_org.get_student_by_id(int(student['rds_student_id']))
    if not rds_student:
        for key in (student.get('pin_no'), student.get('roll_number'), student.get('admission_number')):
            if key:
                rds_student = find_rds_student(key)
                if rds_student:
                    break

    if rds_student:
        profile.update({
            'name': rds_student.get('name') or profile['name'],
            'email': rds_student.get('email') or profile['email'],
            'mobile_number': rds_student.get('mobile_number') or profile['mobile_number'],
            'roll_number': rds_student.get('roll_number') or profile['roll_number'],
            'pin_no': rds_student.get('pin_no') or profile['pin_no'],
            'admission_number': rds_student.get('admission_number') or profile['admission_number'],
            'branch': rds_student.get('branch') or profile['branch'],
            'campus': rds_student.get('campus_name') or profile['campus'],
            'course': rds_student.get('course_name') or profile['course'],
            'batch': rds_student.get('batch_name') or profile['batch'],
            'student_status': rds_student.get('student_status'),
            'current_year': rds_student.get('current_year'),
            'current_semester': rds_student.get('current_semester'),
            'father_name': rds_student.get('father_name'),
            'source': 'rds',
        })
    else:
        profile['campus'] = student.get('campus_name')
        profile['course'] = student.get('course_name')
        profile['batch'] = student.get('batch_name')

    return profile


def sync_all_students(
    *,
    dry_run: bool = False,
    provision_missing: bool = False,
    update_profile: bool = True,
) -> dict:
    """
    Link existing Mongo students to RDS by pin_no / roll_number.
    Optionally provision Mongo accounts for RDS students without a match.
    """
    stats = {
        'linked': 0,
        'already_linked': 0,
        'unmapped_mongo': 0,
        'provisioned': 0,
        'errors': [],
        'dry_run': dry_run,
    }

    if not MySQLRDSConfig.is_configured():
        stats['errors'].append('RDS is not configured')
        return stats

    pin_map = rds_org.build_pin_lookup_map()

    for mongo_student in mongo_db.students.find({}):
        roll = _normalize_identifier(mongo_student.get('roll_number', ''))
        pin = _normalize_identifier(mongo_student.get('pin_no', ''))
        lookup_key = (roll or pin).upper()

        if not lookup_key:
            stats['unmapped_mongo'] += 1
            continue

        rds_row = pin_map.get(lookup_key)
        if not rds_row:
            stats['unmapped_mongo'] += 1
            continue

        if mongo_student.get('rds_student_id') == rds_row['rds_student_id']:
            stats['already_linked'] += 1
            if not dry_run and update_profile:
                try:
                    link_student_to_rds(mongo_student, rds_row, update_profile=True)
                except Exception as exc:
                    stats['errors'].append(f'{roll}: {exc}')
            continue

        if dry_run:
            stats['linked'] += 1
            continue

        try:
            link_student_to_rds(mongo_student, rds_row, update_profile=update_profile)
            stats['linked'] += 1
        except Exception as exc:
            stats['errors'].append(f'{roll}: {exc}')

    if provision_missing and not dry_run:
        linked_pins = {
            _normalize_identifier(s.get('pin_no') or s.get('roll_number', '')).upper()
            for s in mongo_db.students.find({}, {'pin_no': 1, 'roll_number': 1})
            if s.get('pin_no') or s.get('roll_number')
        }
        for pin_key, rds_row in pin_map.items():
            if pin_key in linked_pins:
                continue
            try:
                provision_from_rds(rds_row)
                stats['provisioned'] += 1
            except Exception as exc:
                stats['errors'].append(f'provision {pin_key}: {exc}')

    return stats
