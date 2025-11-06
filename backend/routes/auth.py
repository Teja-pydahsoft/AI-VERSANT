from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from config.shared import bcrypt  # Flask-Bcrypt for password generation
import bcrypt as raw_bcrypt  # Raw bcrypt for password verification
from mongo import mongo_db
from config.constants import ROLES
import traceback
import sys
from bson.errors import InvalidId

auth_bp = Blueprint('auth', __name__)



@auth_bp.route('/login', methods=['POST'])
def login():
    """
    User Login
    ---
    tags:
      - Authentication
    summary: Authenticate user and receive JWT tokens
    description: |
      Login endpoint that accepts username/email/mobile and password.
      Returns JWT access and refresh tokens upon successful authentication.
      
      **Username formats accepted:**
      - Username
      - Email address
      - Mobile number
      
      **Roles supported:**
      - superadmin
      - campus_admin
      - course_admin
      - student
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - username
              - password
            properties:
              username:
                type: string
                example: "student123"
                description: Username, email, or mobile number
              password:
                type: string
                format: password
                example: "password123"
                description: User password
    responses:
      200:
        description: Login successful
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                access_token:
                  type: string
                  example: "eyJ0eXAiOiJKV1QiLCJhbGc..."
                refresh_token:
                  type: string
                  example: "eyJ0eXAiOiJKV1QiLCJhbGc..."
                user:
                  type: object
                  properties:
                    id:
                      type: string
                      example: "507f1f77bcf86cd799439011"
                    username:
                      type: string
                      example: "student123"
                    email:
                      type: string
                      example: "student@example.com"
                    name:
                      type: string
                      example: "John Doe"
                    role:
                      type: string
                      example: "student"
                    campus_id:
                      type: string
                      nullable: true
                    course_id:
                      type: string
                      nullable: true
                    batch_id:
                      type: string
                      nullable: true
      400:
        description: Missing required fields
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                message:
                  type: string
                  example: "Username and password are required"
      401:
        description: Invalid credentials or account deactivated
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                message:
                  type: string
                  example: "Invalid username or password"
      500:
        description: Internal server error
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                message:
                  type: string
                  example: "Login failed: Critical server error"
    """
    try:
        print("🔍 Login attempt started", file=sys.stderr)
        
        data = request.get_json()
        print(f"📝 Request data: {data}", file=sys.stderr)
        
        if not data or not data.get('username') or not data.get('password'):
            print("❌ Missing username or password", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'Username and password are required'
            }), 400
        
        username = data['username']
        password = data['password']
        
        print(f"🔍 Looking up user: {username}", file=sys.stderr)
        
        # Find user by username
        user = mongo_db.find_user_by_username(username)
        # If not found, try by email
        if not user:
            user = mongo_db.users.find_one({'email': username})
        if not user:
            user = mongo_db.users.find_one({'mobile_number': username})
        
        if not user:
            print(f"❌ User not found: {username}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'Invalid username or password'
            }), 401
        
        print(f"✅ User found: {user.get('_id')}", file=sys.stderr)
        
        # Check if user is active
        if not user.get('is_active', True):
            print(f"❌ User account deactivated: {username}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'Account is deactivated'
            }), 401
        
        # Verify password
        if 'password_hash' not in user and 'mobile_number' not in user:
            print(f"❌ CRITICAL: User document missing 'password_hash'. User object: {user}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'Login failed: Critical server error - missing user credentials.'
            }), 500

        print(f"🔍 Verifying password for user: {username}", file=sys.stderr)
        
        if not raw_bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')) and user['mobile_number'] != password:
            print(f"❌ Password verification failed for user: {username}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'Invalid username or password'
            }), 401
        
        print(f"✅ Password verified for user: {username}", file=sys.stderr)
        
        # Create tokens
        print(f"🔑 Creating tokens for user: {username}", file=sys.stderr)
        access_token = create_access_token(identity=str(user['_id']))
        refresh_token = create_refresh_token(identity=str(user['_id']))
        
        # Get additional user info
        user_info = {
            'id': str(user['_id']),
            'username': user['username'],
            'email': user['email'],
            'name': user.get('name', f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()),
            'role': user['role'],
            'campus_id': str(user['campus_id']) if user.get('campus_id') else None,
            'course_id': str(user['course_id']) if user.get('course_id') else None,
            'batch_id': str(user['batch_id']) if user.get('batch_id') else None
        }

        
        # Populate campus name if campus_id exists
        if user.get('campus_id'):
            try:
                campus = mongo_db.campuses.find_one({'_id': user['campus_id']})
                if campus:
                    user_info['campus_name'] = campus.get('name', 'Unknown Campus')
                else:
                    user_info['campus_name'] = f"Campus {str(user['campus_id'])[-8:]}"
            except Exception as e:
                print(f"⚠️ Error fetching campus name: {e}", file=sys.stderr)
                user_info['campus_name'] = f"Campus {str(user['campus_id'])[-8:]}"
        else:
            user_info['campus_name'] = "not listed campus"
        
        print(f"✅ Login successful for user: {username}", file=sys.stderr)
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'data': {
                'user': user_info,
                'access_token': access_token,
                'refresh_token': refresh_token
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Login error: {str(e)}", file=sys.stderr)
        print(f"❌ Traceback: {traceback.format_exc()}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': f'Login failed: {str(e)}'
        }), 500

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """
    User Logout
    ---
    tags:
      - Authentication
    summary: Logout user
    description: Logout endpoint that invalidates the current session
    security:
      - BearerAuth: []
    responses:
      200:
        description: Logout successful
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: "Logout successful"
      401:
        description: Unauthorized - Invalid or missing token
      500:
        description: Internal server error
    """
    try:
        # In a real application, you might want to blacklist the token
        # For now, we'll just return a success message
        return jsonify({
            'success': True,
            'message': 'Logout successful'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Logout failed: {str(e)}'
        }), 500

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh Access Token
    ---
    tags:
      - Authentication
    summary: Refresh JWT access token using refresh token
    description: |
      Use this endpoint to get a new access token using your refresh token.
      The refresh token should be sent in the Authorization header.
    security:
      - BearerAuth: []
    responses:
      200:
        description: Token refreshed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: "Token refreshed successfully"
                data:
                  type: object
                  properties:
                    access_token:
                      type: string
                      example: "eyJ0eXAiOiJKV1QiLCJhbGc..."
      401:
        description: Unauthorized - Invalid refresh token
    """
    try:
        current_user_id = get_jwt_identity()
        new_access_token = create_access_token(identity=current_user_id)
        
        return jsonify({
            'success': True,
            'message': 'Token refreshed successfully',
            'data': {
                'access_token': new_access_token
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Token refresh failed: {str(e)}'
        }), 500

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user information"""
    try:
        import sys
        print('--- /auth/me DEBUG ---', file=sys.stderr)
        print('Headers:', dict(request.headers), file=sys.stderr)
        print('Authorization:', request.headers.get('Authorization'), file=sys.stderr)
        current_user_id = get_jwt_identity()
        print('JWT Identity:', current_user_id, file=sys.stderr)
        try:
            user = mongo_db.find_user_by_id(current_user_id)
        except InvalidId as e:
            print(f"❌ Invalid ObjectId for user: {current_user_id}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': f'Invalid user ID: {current_user_id}'
            }), 400
        except Exception as e:
            print(f"❌ Error looking up user by ID: {str(e)}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': f'Error looking up user: {str(e)}'
            }), 500
        if not user:
            print(f"❌ User not found for ID: {current_user_id}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        user_info = {
            'id': str(user['_id']),
            'username': user['username'],
            'email': user['email'],
            'name': user.get('name', f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get('username', '')),
            'role': user['role'],
            'campus_id': str(user['campus_id']) if user.get('campus_id') else None,
            'course_id': str(user['course_id']) if user.get('course_id') else None,
            'batch_id': str(user['batch_id']) if user.get('batch_id') else None,
            'is_active': user.get('is_active', True)
        }
        
        # Populate campus name if campus_id exists
        if user.get('campus_id'):
            try:
                campus = mongo_db.campuses.find_one({'_id': user['campus_id']})
                if campus:
                    user_info['campus_name'] = campus.get('name', 'Unknown Campus')
                else:
                    user_info['campus_name'] = f"Campus {str(user['campus_id'])[-8:]}"
            except Exception as e:
                print(f"⚠️ Error fetching campus name in /me: {e}", file=sys.stderr)
                user_info['campus_name'] = f"Campus {str(user['campus_id'])[-8:]}"
        return jsonify({
            'success': True,
            'message': 'User information retrieved successfully',
            'data': user_info
        }), 200
    except Exception as e:
        import sys
        print(f"❌ /auth/me error: {str(e)}", file=sys.stderr)
        print(f"❌ Traceback: {traceback.format_exc()}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': f'Failed to get user information: {str(e)}'
        }), 500 