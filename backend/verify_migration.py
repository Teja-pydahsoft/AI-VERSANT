"""Verify migration was successful"""
from mongo import mongo_db

user = mongo_db.db.users.find_one({'username': 'subsup'})
print('User fields:', list(user.keys()))
print('Has password_hash:', 'password_hash' in user)
print('Has password:', 'password' in user)
print('Role:', user.get('role'))
print('Role Name:', user.get('role_name'))
