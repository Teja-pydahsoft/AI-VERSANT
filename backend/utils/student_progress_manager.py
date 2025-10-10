"""
Enhanced Student Progress Management System
Handles score-based unlocking, admin overrides, and progress tracking
"""

from datetime import datetime
from bson import ObjectId
from config.constants import MODULES, LEVELS
import logging
from .progress_monitoring import ProgressMonitoring

class StudentProgressManager:
    def __init__(self, mongo_db):
        self.mongo_db = mongo_db
        self.logger = logging.getLogger(__name__)
        self.monitoring = ProgressMonitoring(mongo_db)
    
    def update_student_progress_on_test_completion(self, student_id, level_id, score, test_id=None):
        """
        Update student progress when they complete a test
        This is the main function called after test submission
        """
        try:
            student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
            if not student:
                self.logger.error(f"Student not found: {student_id}")
                return False
            
            # Get current authorized levels
            current_authorized = self._get_current_authorized_levels(student)
            
            # Check if this score unlocks new levels
            new_unlocked_levels = self._check_dependencies_and_thresholds(level_id, score, current_authorized)
            
            # Update authorized_levels with score-based unlocks
            for new_level in new_unlocked_levels:
                if new_level not in current_authorized:
                    self._add_authorized_level(
                        student_id, 
                        new_level, 
                        'score', 
                        score_unlocked=score,
                        test_id=test_id
                    )
            
            # Update module progress
            self._update_module_progress(student_id, level_id, score)
            
            # Add to unlock history
            self._add_unlock_history(student_id, level_id, score, 'score', test_id)
            
            self.logger.info(f"Updated progress for student {student_id}: unlocked {len(new_unlocked_levels)} new levels")
            
            # Monitor the progress update
            for level_id in new_unlocked_levels:
                self.monitoring.log_progress_event(
                    event_type='unlock',
                    student_id=student_id,
                    level_id=level_id,
                    details={
                        'score': score,
                        'test_id': str(test_id) if test_id else None,
                        'unlock_type': 'score_based'
                    }
                )
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error updating student progress: {e}")
            
            # Monitor the error
            self.monitoring.log_progress_event(
                event_type='error',
                student_id=student_id,
                level_id=level_id,
                details={
                    'error_type': 'progress_update_failed',
                    'error_message': str(e),
                    'score': score
                }
            )
            
            return False
    
    def admin_authorize_module(self, student_id, module_id, admin_user_id, reason=None):
        """
        Admin authorizes entire module regardless of score
        """
        try:
            # Get all levels for this module
            module_levels = self._get_module_levels(module_id)
            if not module_levels:
                return False, "No levels found for this module"
            
            # Add to authorized_levels with admin flag
            for level_id in module_levels:
                self._add_authorized_level(
                    student_id,
                    level_id,
                    'admin',
                    authorized_by_user=admin_user_id,
                    reason=reason
                )
            
            # Update module progress with admin override
            self._update_module_progress_admin_override(student_id, module_id)
            
            # Add to unlock history
            for level_id in module_levels:
                self._add_unlock_history(student_id, level_id, None, 'admin', None, admin_user_id, reason)
            
            self.logger.info(f"Admin {admin_user_id} authorized module {module_id} for student {student_id}")
            
            # Monitor the admin authorization
            for level_id in module_levels:
                self.monitoring.log_progress_event(
                    event_type='authorize',
                    student_id=student_id,
                    level_id=level_id,
                    details={
                        'admin_user_id': str(admin_user_id),
                        'module_id': module_id,
                        'reason': reason,
                        'authorization_type': 'admin_override'
                    }
                )
            
            return True, f"Module {module_id} authorized successfully"
            
        except Exception as e:
            self.logger.error(f"Error in admin authorize module: {e}")
            return False, str(e)
    
    def admin_authorize_level(self, student_id, level_id, admin_user_id, reason=None):
        """
        Admin authorizes individual level regardless of score
        """
        try:
            # Add to authorized_levels with admin flag
            self._add_authorized_level(
                student_id,
                level_id,
                'admin',
                authorized_by_user=admin_user_id,
                reason=reason
            )
            
            # Update module progress
            module_id = self._get_level_module(level_id)
            if module_id:
                self._update_module_progress_admin_override(student_id, module_id)
            
            # Add to unlock history
            self._add_unlock_history(student_id, level_id, None, 'admin', None, admin_user_id, reason)
            
            self.logger.info(f"Admin {admin_user_id} authorized level {level_id} for student {student_id}")
            return True, f"Level {level_id} authorized successfully"
            
        except Exception as e:
            self.logger.error(f"Error in admin authorize level: {e}")
            return False, str(e)
    
    def admin_lock_module(self, student_id, module_id, admin_user_id, reason=None):
        """
        Admin locks entire module
        """
        try:
            # Get all levels for this module
            module_levels = self._get_module_levels(module_id)
            if not module_levels:
                return False, "No levels found for this module"
            
            # Remove from authorized_levels
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$pull': {'authorized_levels': {'level_id': {'$in': module_levels}}}}
            )
            
            # Update module progress
            self._update_module_progress_lock(student_id, module_id)
            
            # Add to lock history
            self._add_lock_history(student_id, module_id, admin_user_id, reason)
            
            self.logger.info(f"Admin {admin_user_id} locked module {module_id} for student {student_id}")
            return True, f"Module {module_id} locked successfully"
            
        except Exception as e:
            self.logger.error(f"Error in admin lock module: {e}")
            return False, str(e)
    
    def get_student_detailed_insights(self, student_id):
        """
        Get comprehensive student insights for admin dashboard
        """
        try:
            student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
            if not student:
                return None
            # Prepare robust student identifier match (some records store string ids or different fields)
            student_obj_id = student.get('_id')
            student_id_str = str(student_obj_id)
            identifiers = {student_obj_id, student_id_str}
            # include associated user id if present
            user_id = student.get('user_id')
            if user_id:
                identifiers.add(user_id)
                try:
                    identifiers.add(str(user_id))
                except Exception:
                    pass
            # include roll_number and email which some attempt docs may store
            roll_number = student.get('roll_number')
            email = student.get('email')
            if roll_number:
                identifiers.add(roll_number)
            if email:
                identifiers.add(email)

            # Build OR clauses for possible fields in attempt documents
            or_clauses = []
            for ident in identifiers:
                or_clauses.append({'student_id': ident})
                or_clauses.append({'user_id': ident})
                or_clauses.append({'student_email': ident})
                or_clauses.append({'student_roll_number': ident})

            # Fetch attempts from student_test_attempts and test_results (both possible places)
            attempts = []
            try:
                if hasattr(self.mongo_db, 'student_test_attempts'):
                    attempts = list(self.mongo_db.student_test_attempts.find({'$or': or_clauses}))
            except Exception as e:
                self.logger.warning(f"Failed to read student_test_attempts: {e}")

            # Also try test_results collection which may contain older/stored results
            try:
                if hasattr(self.mongo_db, 'test_results'):
                    test_results = list(self.mongo_db.test_results.find({'$or': or_clauses}))
                    # Normalize field names to match attempts shape where possible and append
                    for tr in test_results:
                        # Ensure we don't duplicate entries with same _id
                        attempts.append(tr)
            except Exception as e:
                self.logger.warning(f"Failed to read test_results: {e}")

            # Deduplicate attempts by their _id
            unique = {}
            for att in attempts:
                try:
                    key = str(att.get('_id'))
                except Exception:
                    key = repr(att)
                unique[key] = att
            attempts = list(unique.values())

            # Split practice vs online attempts
            practice_attempts = [a for a in attempts if a.get('test_type') == 'practice']
            online_attempts = [a for a in attempts if a.get('test_type') == 'online']

            # Build per-module analytics structure
            module_analysis = {}
            modules_list = ['GRAMMAR', 'VOCABULARY', 'LISTENING', 'SPEAKING', 'READING', 'WRITING']

            # Helper to aggregate attempts list per module
            def parse_date(v):
                if not v:
                    return None
                if isinstance(v, datetime):
                    return v
                # Handle Mongo extended JSON formats and numeric timestamps
                if isinstance(v, dict):
                    # { '$date': { '$numberLong': '...' } } or { '$date': 'iso' }
                    if '$date' in v:
                        d = v['$date']
                        if isinstance(d, dict) and '$numberLong' in d:
                            try:
                                ms = int(d['$numberLong'])
                                return datetime.fromtimestamp(ms / 1000.0)
                            except Exception:
                                return None
                        if isinstance(d, (int, float)):
                            try:
                                # assume milliseconds
                                return datetime.fromtimestamp(d / 1000.0)
                            except Exception:
                                return None
                        if isinstance(d, str):
                            try:
                                return datetime.fromisoformat(d)
                            except Exception:
                                return None
                    # direct number-long style
                    if '$numberLong' in v:
                        try:
                            ms = int(v['$numberLong'])
                            return datetime.fromtimestamp(ms / 1000.0)
                        except Exception:
                            return None
                    return None
                # Numeric timestamps
                if isinstance(v, (int, float)):
                    try:
                        if v > 1e12:
                            return datetime.fromtimestamp(v / 1000.0)
                        return datetime.fromtimestamp(v)
                    except Exception:
                        return None
                # String timestamps - try numeric then iso
                if isinstance(v, str):
                    try:
                        num = int(v)
                        if num > 1e12:
                            return datetime.fromtimestamp(num / 1000.0)
                        return datetime.fromtimestamp(num)
                    except Exception:
                        try:
                            return datetime.fromisoformat(v)
                        except Exception:
                            return None
                return None

            def aggregate_attempts(attempts_list):
                by_test = {}
                total_attempts = len(attempts_list)
                total_score = 0
                score_count = 0
                highest_score = 0
                last_attempt = None

                for att in attempts_list:
                    mod = att.get('module_id') or att.get('module') or 'UNKNOWN'
                    tid = att.get('test_id')
                    try:
                        tid_key = str(tid)
                    except Exception:
                        tid_key = tid

                    # per-test bucket
                    if tid_key not in by_test:
                        by_test[tid_key] = {
                            'test_id': tid_key,
                            'test_name': att.get('test_name') or att.get('name') or 'Unknown Test',
                            'attempts': 0,
                            'best_score': 0,
                            'last_attempt': None
                        }

                    # Score extraction (support different field names and nested BSON numeric formats)
                    def extract_numeric(v):
                        # Handles int/float
                        if v is None:
                            return None
                        if isinstance(v, (int, float)):
                            return float(v)
                        # Handle Mongo extended JSON like {'$numberInt': '42'} or {'$numberDouble': '42.0'}
                        if isinstance(v, dict):
                            if '$numberDouble' in v:
                                try:
                                    return float(v['$numberDouble'])
                                except Exception:
                                    return None
                            if '$numberInt' in v:
                                try:
                                    return float(v['$numberInt'])
                                except Exception:
                                    return None
                            # nested $date or others will be ignored
                            return None
                        # Strings
                        if isinstance(v, str):
                            try:
                                return float(v)
                            except Exception:
                                return None
                        return None

                    def parse_score(attempt_doc):
                        # Preferred fields in order
                        candidates = ['average_score', 'score_percentage', 'percentage', 'score', 'total_score']
                        for key in candidates:
                            if key in attempt_doc:
                                val = attempt_doc.get(key)
                                num = extract_numeric(val)
                                if num is not None:
                                    # If total_score was stored as an integer representing percent*100 or score*100,
                                    # try to detect a too-large value and normalize by 100 if appropriate.
                                    if key == 'total_score' and num > 1000:
                                        # likely stored as percent*100 or score*100; normalize by 100
                                        try:
                                            return num / 100.0
                                        except Exception:
                                            return num
                                    return num

                        # If none of the preferred keys found, scan the document for numeric values
                        for v in attempt_doc.values():
                            num = extract_numeric(v)
                            if num is not None:
                                return num
                        return 0

                    score_val = parse_score(att) or 0

                    by_test[tid_key]['attempts'] += 1
                    if score_val > by_test[tid_key]['best_score']:
                        by_test[tid_key]['best_score'] = score_val

                    # update totals
                    if score_val is not None and score_val > 0:
                        total_score += score_val
                        score_count += 1
                    if score_val is not None and score_val > highest_score:
                        highest_score = score_val

                    # last attempt
                    att_time = att.get('submitted_at') or att.get('end_time') or att.get('created_at')
                    parsed_time = parse_date(att_time)
                    if parsed_time:
                        if not last_attempt or parsed_time > last_attempt:
                            last_attempt = parsed_time

                    # update per-test last_attempt
                    if parsed_time:
                        if not by_test[tid_key].get('last_attempt') or parsed_time > by_test[tid_key].get('last_attempt'):
                            by_test[tid_key]['last_attempt'] = parsed_time

                # Build list of tests
                tests_list = list(by_test.values())

                avg_score = (total_score / score_count) if score_count > 0 else 0

                # Convert any datetime objects to ISO strings for JSON-friendly output
                def iso_or_none(dt):
                    if isinstance(dt, datetime):
                        return dt.isoformat()
                    return None

                for t in tests_list:
                    t['last_attempt'] = iso_or_none(t.get('last_attempt'))

                return {
                    'total_attempts': total_attempts,
                    'distinct_tests': len(by_test),
                    'average_score': avg_score,
                    'highest_score': highest_score,
                    'last_attempt': iso_or_none(last_attempt),
                    'tests': tests_list
                }

            # Precompute aggregates grouped by module for practice and online
            practice_by_module = {}
            online_by_module = {}
            for att in practice_attempts:
                mod = att.get('module_id') or att.get('module') or 'UNKNOWN'
                practice_by_module.setdefault(mod, []).append(att)
            for att in online_attempts:
                mod = att.get('module_id') or att.get('module') or 'UNKNOWN'
                online_by_module.setdefault(mod, []).append(att)

            # For each module, compute both practice and online analytics and combine
            overall_levels_unlocked = 0
            overall_modules_accessed = 0
            overall_total_attempts = len(attempts)
            overall_score_acc = 0
            overall_score_count = 0

            for module_id in modules_list:
                p_attempts = practice_by_module.get(module_id, [])
                o_attempts = online_by_module.get(module_id, [])

                p_agg = aggregate_attempts(p_attempts)
                o_agg = aggregate_attempts(o_attempts)

                # Analyze levels/unlocks using existing helper
                module_meta = self._analyze_module_progress(student_id, module_id, practice_attempts)

                module_analysis[module_id] = {
                    'practice': p_agg,
                    'online': o_agg,
                    'levels_unlocked': module_meta.get('levels_unlocked', 0),
                    'current_level': module_meta.get('current_level'),
                    'next_level': module_meta.get('next_level'),
                    'current_score': module_meta.get('current_score'),
                    'total_levels': module_meta.get('total_levels'),
                    'last_attempt': max(filter(None, [p_agg.get('last_attempt'), o_agg.get('last_attempt')])) if (p_agg.get('last_attempt') or o_agg.get('last_attempt')) else None
                }

                overall_levels_unlocked += module_analysis[module_id]['levels_unlocked']
                if (p_agg.get('distinct_tests', 0) + o_agg.get('distinct_tests', 0)) > 0:
                    overall_modules_accessed += 1

                # overall score accumulation
                if p_agg.get('average_score', 0) > 0:
                    overall_score_acc += p_agg.get('average_score', 0)
                    overall_score_count += 1
                if o_agg.get('average_score', 0) > 0:
                    overall_score_acc += o_agg.get('average_score', 0)
                    overall_score_count += 1

            overall_average_score = (overall_score_acc / overall_score_count) if overall_score_count > 0 else 0

            # Compute assigned online tests count (tests available/assigned to student)
            assigned_online_tests = []
            try:
                if hasattr(self.mongo_db, 'tests'):
                    # Query online tests assigned directly or via campus/course/batch matching
                    query = {'test_type': 'online', 'status': 'active'}
                    # Try to match assigned_student_ids or campus/course/batch
                    campus_id = student.get('campus_id')
                    course_id = student.get('course_id')
                    batch_id = student.get('batch_id')

                    # Build or filters
                    or_clauses = []
                    or_clauses.append({'assigned_student_ids': {'$in': [student_obj_id, student_id_str]}})
                    if campus_id:
                        or_clauses.append({'campus_ids': campus_id})
                    if course_id:
                        or_clauses.append({'course_ids': course_id})
                    if batch_id:
                        or_clauses.append({'batch_ids': batch_id})

                    if or_clauses:
                        query['$or'] = or_clauses

                    assigned_online_tests = list(self.mongo_db.tests.find(query, {'questions': 0, 'audio_config': 0}))
            except Exception as e:
                self.logger.warning(f"Failed to read tests collection for assigned online tests: {e}")

            insights = {
                'student_info': {
                    'name': student.get('name', 'Unknown'),
                    'roll_number': student.get('roll_number', 'Unknown'),
                    'email': student.get('email', 'Unknown'),
                    'student_id': str(student_obj_id)
                },
                'module_analysis': module_analysis,
                'practice_attempts_count': len(practice_attempts),
                'online_attempts_count': len(online_attempts),
                'assigned_online_tests_count': len(assigned_online_tests),
                'assigned_online_tests': [{'_id': str(t.get('_id')), 'test_id': str(t.get('_id')), 'name': t.get('name'), 'module_id': t.get('module_id')} for t in assigned_online_tests],
                'overall_stats': {
                    'total_attempts': overall_total_attempts,
                    'average_score': overall_average_score,
                    'modules_accessed': overall_modules_accessed,
                    'levels_unlocked': overall_levels_unlocked
                },
                'unlock_recommendations': [],
                'admin_actions_taken': self._get_admin_actions_history(student_id)
            }

            # Generate simple unlock recommendations based on module_analysis
            for mod_id, mdata in module_analysis.items():
                # if student has a current_score meeting threshold but next level not unlocked
                try:
                    cur_score = mdata.get('current_score', 0) or 0
                    next_unlocked = mdata.get('next_level') in self._get_current_authorized_levels(student)
                    if cur_score >= 60 and not next_unlocked and mdata.get('next_level'):
                        insights['unlock_recommendations'].append({
                            'module': mod_id,
                            'level': mdata.get('next_level'),
                            'action': 'auto_unlock',
                            'reason': f"Score {cur_score} meets threshold",
                            'priority': 'high'
                        })
                    elif cur_score < 60 and cur_score > 30 and mdata.get('next_level'):
                        insights['unlock_recommendations'].append({
                            'module': mod_id,
                            'level': mdata.get('next_level'),
                            'action': 'admin_override',
                            'reason': f"Score {cur_score} below threshold but shows potential",
                            'priority': 'medium'
                        })
                except Exception:
                    continue

            return insights
            
        except Exception as e:
            self.logger.error(f"Error getting student insights: {e}")
            return None
    
    def _get_current_authorized_levels(self, student):
        """Get current authorized levels as a set"""
        authorized_levels = student.get('authorized_levels', [])
        if isinstance(authorized_levels, list) and len(authorized_levels) > 0:
            # Handle both old format (strings) and new format (objects)
            if isinstance(authorized_levels[0], str):
                return set(authorized_levels)
            else:
                return set([level['level_id'] for level in authorized_levels])
        return set()
    
    def _check_dependencies_and_thresholds(self, completed_level_id, score, current_authorized):
        """Check if completing this level unlocks new levels"""
        new_unlocked = []
        
        # Find levels that depend on this completed level
        for level_id, level_info in LEVELS.items():
            if isinstance(level_info, dict):
                depends_on = level_info.get('depends_on')
                if depends_on == completed_level_id:
                    # Check if already authorized
                    if level_id not in current_authorized:
                        # Check threshold
                        threshold = level_info.get('unlock_threshold', 60)
                        if score >= threshold:
                            new_unlocked.append(level_id)
        
        return new_unlocked
    
    def _add_authorized_level(self, student_id, level_id, authorized_by, score_unlocked=None, 
                            authorized_by_user=None, test_id=None, reason=None):
        """Add a level to authorized_levels with metadata"""
        
        # Ensure authorized_levels exists and is in new format
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        if not student.get('authorized_levels'):
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$set': {'authorized_levels': []}}
            )
        
        # Check if level already exists
        existing_levels = student.get('authorized_levels', [])
        level_exists = False
        
        for level in existing_levels:
            if isinstance(level, dict) and level.get('level_id') == level_id:
                level_exists = True
                break
            elif isinstance(level, str) and level == level_id:
                level_exists = True
                break
        
        if not level_exists:
            level_data = {
                'level_id': level_id,
                'authorized_by': authorized_by,
                'authorized_at': datetime.utcnow(),
                'is_admin_override': authorized_by == 'admin'
            }
            
            if score_unlocked is not None:
                level_data['score_unlocked'] = score_unlocked
            
            if authorized_by_user:
                level_data['authorized_by_user'] = authorized_by_user
            
            if test_id:
                level_data['test_id'] = test_id
            
            if reason:
                level_data['reason'] = reason
            
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$push': {'authorized_levels': level_data}}
            )
    
    def _update_module_progress(self, student_id, level_id, score):
        """Update module progress tracking"""
        module_id = self._get_level_module(level_id)
        if not module_id:
            return
        
        # Initialize module_progress if it doesn't exist
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        if not student.get('module_progress'):
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$set': {'module_progress': {}}}
            )
        
        # Update specific module progress
        update_data = {
            f'module_progress.{module_id}.last_attempt': datetime.utcnow(),
            f'module_progress.{module_id}.last_score': score
        }
        
        # Update highest score if this is higher
        current_highest = student.get('module_progress', {}).get(module_id, {}).get('highest_score', 0)
        if score > current_highest:
            update_data[f'module_progress.{module_id}.highest_score'] = score
        
        # Update total score
        current_total = student.get('module_progress', {}).get(module_id, {}).get('total_score', 0)
        update_data[f'module_progress.{module_id}.total_score'] = current_total + score
        
        # Update attempts count
        current_attempts = student.get('module_progress', {}).get(module_id, {}).get('attempts_count', 0)
        update_data[f'module_progress.{module_id}.attempts_count'] = current_attempts + 1
        
        self.mongo_db.students.update_one(
            {'_id': ObjectId(student_id)},
            {'$set': update_data}
        )
    
    def _update_module_progress_admin_override(self, student_id, module_id):
        """Update module progress when admin overrides"""
        update_data = {
            f'module_progress.{module_id}.unlock_status': 'admin_override',
            f'module_progress.{module_id}.admin_override_at': datetime.utcnow()
        }
        
        self.mongo_db.students.update_one(
            {'_id': ObjectId(student_id)},
            {'$set': update_data}
        )
    
    def _update_module_progress_lock(self, student_id, module_id):
        """Update module progress when admin locks"""
        update_data = {
            f'module_progress.{module_id}.unlock_status': 'locked',
            f'module_progress.{module_id}.locked_at': datetime.utcnow()
        }
        
        self.mongo_db.students.update_one(
            {'_id': ObjectId(student_id)},
            {'$set': update_data}
        )
    
    def _add_unlock_history(self, student_id, level_id, score, unlock_type, test_id=None, 
                          admin_user_id=None, reason=None):
        """Add entry to unlock history"""
        # Initialize unlock_history if it doesn't exist
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        if not student.get('unlock_history'):
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$set': {'unlock_history': []}}
            )
        
        history_entry = {
            'level_id': level_id,
            'unlocked_at': datetime.utcnow(),
            'unlocked_by': unlock_type,
            'score': score
        }
        
        if test_id:
            history_entry['test_id'] = test_id
        
        if admin_user_id:
            history_entry['unlocked_by_user'] = admin_user_id
        
        if reason:
            history_entry['reason'] = reason
        
        # Cap unlock_history to last N entries to prevent unbounded growth
        MAX_HISTORY = 200
        try:
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$push': {'unlock_history': {'$each': [history_entry], '$slice': -MAX_HISTORY}}}
            )
        except Exception as e:
            # Fallback to simple push if capped push fails for any reason
            self.logger.exception(f"Failed to push capped unlock_history, falling back: {e}")
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$push': {'unlock_history': history_entry}}
            )
    
    def _add_lock_history(self, student_id, module_id, admin_user_id, reason=None):
        """Add entry to lock history"""
        # Initialize lock_history if it doesn't exist
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        if not student.get('lock_history'):
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$set': {'lock_history': []}}
            )
        
        history_entry = {
            'module_id': module_id,
            'locked_at': datetime.utcnow(),
            'locked_by_user': admin_user_id
        }
        
        if reason:
            history_entry['reason'] = reason
        
        # Cap lock_history to last N entries
        MAX_LOCK_HISTORY = 100
        try:
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$push': {'lock_history': {'$each': [history_entry], '$slice': -MAX_LOCK_HISTORY}}}
            )
        except Exception as e:
            self.logger.exception(f"Failed to push capped lock_history, falling back: {e}")
            self.mongo_db.students.update_one(
                {'_id': ObjectId(student_id)},
                {'$push': {'lock_history': history_entry}}
            )
    
    def _get_module_levels(self, module_id):
        """Get all level IDs for a module"""
        return [level_id for level_id, level in LEVELS.items() 
                if isinstance(level, dict) and level.get('module_id') == module_id]
    
    def _get_level_module(self, level_id):
        """Get module ID for a level"""
        level_info = LEVELS.get(level_id, {})
        if isinstance(level_info, dict):
            return level_info.get('module_id')
        return None
    
    def _analyze_module_progress(self, student_id, module_id, attempts):
        """Analyze progress for a specific module"""
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        module_progress = student.get('module_progress', {}).get(module_id, {})
        authorized_levels = self._get_current_authorized_levels(student)
        
        # Get module levels
        module_levels = self._get_module_levels(module_id)
        
        # Calculate current score and progress
        current_score = module_progress.get('highest_score', 0)
        total_score = module_progress.get('total_score', 0)
        attempts_count = module_progress.get('attempts_count', 0)
        
        # Find current level (highest unlocked)
        current_level = None
        levels_unlocked = 0
        
        for level_id in module_levels:
            if level_id in authorized_levels:
                levels_unlocked += 1
                current_level = level_id
        
        # Find next level to unlock
        next_level = None
        if current_level:
            for level_id, level_info in LEVELS.items():
                if isinstance(level_info, dict) and level_info.get('depends_on') == current_level:
                    if level_id not in authorized_levels:
                        next_level = level_id
                        break
        
        # Check if next level is unlocked
        next_level_unlocked = next_level in authorized_levels if next_level else False
        
        return {
            'current_level': current_level,
            'next_level': next_level,
            'current_score': current_score,
            'total_score': total_score,
            'attempts_count': attempts_count,
            'levels_unlocked': levels_unlocked,
            'total_levels': len(module_levels),
            'next_level_unlocked': next_level_unlocked,
            'unlock_status': module_progress.get('unlock_status', 'score_based'),
            'last_attempt': module_progress.get('last_attempt'),
            'admin_override_available': current_score < 60 and current_score > 30
        }
    
    def _get_admin_actions_history(self, student_id):
        """Get history of admin actions for this student"""
        student = self.mongo_db.students.find_one({'_id': ObjectId(student_id)})
        
        actions = []
        
        # Get unlock history
        unlock_history = student.get('unlock_history', [])
        for entry in unlock_history:
            if entry.get('unlocked_by') == 'admin':
                actions.append({
                    'type': 'unlock',
                    'level_id': entry.get('level_id'),
                    'timestamp': entry.get('unlocked_at'),
                    'admin_user': entry.get('unlocked_by_user'),
                    'reason': entry.get('reason')
                })
        
        # Get lock history
        lock_history = student.get('lock_history', [])
        for entry in lock_history:
            actions.append({
                'type': 'lock',
                'module_id': entry.get('module_id'),
                'timestamp': entry.get('locked_at'),
                'admin_user': entry.get('locked_by_user'),
                'reason': entry.get('reason')
            })
        
        # Sort by timestamp
        actions.sort(key=lambda x: x.get('timestamp', datetime.min), reverse=True)
        
        return actions[:10]  # Return last 10 actions

