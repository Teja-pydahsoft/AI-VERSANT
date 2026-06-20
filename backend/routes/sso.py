"""
SSO (Single Sign-On) Route
Handles token exchange for students arriving from external portals
(e.g. sdms.pydah.edu.in) so they land directly on the dashboard
without re-entering credentials.

Flow:
  1. SDMS signs a short-lived JWT with the shared SDMS_SSO_SECRET and redirects:
       https://crt.pydahsoft.in/sso-login?token=<sdms_token>
  2. Frontend /sso-login page POSTs that token to POST /auth/sso-exchange
  3. This endpoint verifies the token, finds the matching student in our DB,
     and returns our own access + refresh tokens.
"""

import os
import sys
import traceback
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token
import jwt as pyjwt  # PyJWT — already installed as a flask-jwt-extended dependency

from mongo import mongo_db

sso_bp = Blueprint('sso', __name__)

# ── helpers ──────────────────────────────────────────────────────────────────

def _get_sso_secret() -> str:
    secret = os.getenv('SDMS_SSO_SECRET', '').strip()
    if not secret:
        raise EnvironmentError(
            'SDMS_SSO_SECRET is not configured. '
            'Add it to your .env file and restart the server.'
        )
    return secret


def _build_user_info(user: dict) -> dict:
    """Build the same user-info dict that the normal login endpoint returns."""
    info = {
        'id':        str(user['_id']),
        'username':  user.get('username', ''),
        'email':     user.get('email', ''),
        'name':      user.get(
                         'name',
                         f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                         or user.get('username', ''),
                     ),
        'role':      user.get('role', 'student'),
        'campus_id':  str(user['campus_id'])  if user.get('campus_id')  else None,
        'course_id':  str(user['course_id'])  if user.get('course_id')  else None,
        'batch_id':   str(user['batch_id'])   if user.get('batch_id')   else None,
        'is_active':  user.get('is_active', True),
    }

    # Populate campus name
    if user.get('campus_id'):
        try:
            campus = mongo_db.campuses.find_one({'_id': user['campus_id']})
            info['campus_name'] = campus.get('name', 'Unknown Campus') if campus else f"Campus {str(user['campus_id'])[-8:]}"
        except Exception:
            info['campus_name'] = f"Campus {str(user['campus_id'])[-8:]}"
    else:
        info['campus_name'] = 'not listed campus'

    return info


# ── endpoint ─────────────────────────────────────────────────────────────────

@sso_bp.route('/sso-exchange', methods=['POST'])
def sso_exchange():
    """
    SSO Token Exchange
    ---
    tags:
      - Authentication
    summary: Exchange an SDMS portal token for Versant JWT tokens
    description: |
      Accepts a short-lived JWT issued by the SDMS student portal,
      verifies it using the shared SDMS_SSO_SECRET, looks up the student
      in our database, and returns our own access + refresh tokens so the
      student lands directly on the dashboard.

      **Expected SDMS token payload (minimum):**
      ```json
      {
        "sub":              "<roll_number or admission_number>",
        "username":         "<same as sub — optional but helpful>",
        "admission_number": "<optional>",
        "roll_number":      "<optional>",
        "email":            "<optional>",
        "exp":              <unix timestamp>
      }
      ```
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - token
            properties:
              token:
                type: string
                description: The JWT token issued by the SDMS portal
    responses:
      200:
        description: Token exchange successful — returns Versant JWT tokens
      400:
        description: Missing or invalid token
      401:
        description: Token signature invalid or expired
      404:
        description: Student not found in Versant database
      500:
        description: Server configuration error
    """
    try:
        data = request.get_json(silent=True) or {}
        sdms_token = (data.get('token') or '').strip()

        if not sdms_token:
            return jsonify({'success': False, 'message': 'SSO token is required'}), 400

        # ── 1. Verify the incoming SDMS token ────────────────────────────────
        try:
            sso_secret = _get_sso_secret()
        except EnvironmentError as cfg_err:
            print(f'❌ SSO config error: {cfg_err}', file=sys.stderr)
            return jsonify({'success': False, 'message': 'SSO is not configured on this server. Contact the administrator.'}), 500

        try:
            payload = pyjwt.decode(
                sdms_token,
                sso_secret,
                algorithms=['HS256'],
                options={'require': ['sub', 'exp']},
            )
        except pyjwt.ExpiredSignatureError:
            return jsonify({'success': False, 'message': 'SSO token has expired. Please log in again from SDMS.'}), 401
        except pyjwt.InvalidTokenError as token_err:
            print(f'❌ SSO token invalid: {token_err}', file=sys.stderr)
            return jsonify({'success': False, 'message': 'SSO token is invalid or tampered.'}), 401

        # ── 2. Extract student identifiers from the SDMS payload ─────────────
        #   SDMS should put the roll/admission number in "sub".
        #   We also accept "username", "admission_number", "roll_number", "email"
        #   as fallbacks so different SDMS token shapes all work.
        identifiers = list(filter(None, [
            payload.get('sub'),
            payload.get('username'),
            payload.get('admission_number'),
            payload.get('roll_number'),
            payload.get('email'),
        ]))

        print(f'🔍 SSO exchange — identifiers from token: {identifiers}', file=sys.stderr)

        # ── 3. Look up the student in our database ───────────────────────────
        user = None
        for ident in identifiers:
            if not ident:
                continue
            # Try username, email, mobile_number, and roll_number fields
            user = (
                mongo_db.find_user_by_username(ident)
                or mongo_db.users.find_one({'email': ident})
                or mongo_db.users.find_one({'mobile_number': ident})
            )
            if user:
                break

        # If still not found, try the student-mapping service (RDS lookup)
        if not user:
            for ident in identifiers:
                if not ident:
                    continue
                try:
                    from services.student_mapping_service import resolve_login_user
                    user = resolve_login_user(ident)
                    if user:
                        break
                except Exception as rds_exc:
                    print(f'⚠️ RDS SSO lookup failed for "{ident}": {rds_exc}', file=sys.stderr)

        if not user:
            return jsonify({
                'success': False,
                'message': 'No matching student found. Make sure your SDMS account is linked to Versant.',
            }), 404

        # ── 4. Basic account checks ──────────────────────────────────────────
        if not user.get('is_active', True):
            return jsonify({'success': False, 'message': 'Your account is deactivated. Contact your administrator.'}), 401

        # Only students should be able to use this SSO flow
        if user.get('role', 'student') != 'student':
            return jsonify({'success': False, 'message': 'SSO login is only available for students.'}), 403

        # ── 5. Issue our own tokens ──────────────────────────────────────────
        user_id_str   = str(user['_id'])
        access_token  = create_access_token(identity=user_id_str)
        refresh_token = create_refresh_token(identity=user_id_str)
        user_info     = _build_user_info(user)

        print(f'✅ SSO exchange successful for user {user_id_str} ({user.get("username")})', file=sys.stderr)

        return jsonify({
            'success': True,
            'message': 'SSO login successful',
            'data': {
                'user':          user_info,
                'access_token':  access_token,
                'refresh_token': refresh_token,
            },
        }), 200

    except Exception as exc:
        print(f'❌ SSO exchange error: {exc}', file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return jsonify({'success': False, 'message': f'SSO login failed: {exc}'}), 500
