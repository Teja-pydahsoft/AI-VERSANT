"""Read-only MySQL RDS connection manager."""
import logging
import re
import threading
import time

import pymysql
from pymysql.cursors import DictCursor

from config.mysql_rds import MySQLRDSConfig

logger = logging.getLogger(__name__)

_WRITE_PATTERN = re.compile(
    r'^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|CALL)\b',
    re.IGNORECASE,
)


class ReadOnlyCursor(DictCursor):
    """Cursor that rejects write SQL when MYSQL_RDS_READ_ONLY is enabled."""

    def execute(self, query, args=None):
        if MySQLRDSConfig.READ_ONLY and _WRITE_PATTERN.match(query or ''):
            raise PermissionError(
                'RDS organization database is read-only. Write operations are not permitted.'
            )
        return super().execute(query, args)

    def executemany(self, query, args):
        if MySQLRDSConfig.READ_ONLY and _WRITE_PATTERN.match(query or ''):
            raise PermissionError(
                'RDS organization database is read-only. Write operations are not permitted.'
            )
        return super().executemany(query, args)


class MySQLRDSManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._connection = None
        self._last_used = 0.0
        self._conn_lock = threading.Lock()
        self._initialized = True

    def _connect(self):
        kwargs = MySQLRDSConfig.connection_kwargs()
        kwargs['cursorclass'] = ReadOnlyCursor
        self._connection = pymysql.connect(**kwargs)
        logger.info('Connected to AWS RDS MySQL (organization data, read-only=%s)', MySQLRDSConfig.READ_ONLY)

    def get_connection(self):
        if not MySQLRDSConfig.is_configured():
            raise RuntimeError('MySQL RDS is not configured. Set DB_HOST, DB_USER, DB_NAME in environment.')

        with self._conn_lock:
            now = time.time()
            if self._connection is None or (now - self._last_used > 300):
                if self._connection:
                    try:
                        self._connection.close()
                    except Exception:
                        pass
                self._connect()
            self._last_used = now
            return self._connection

    def cursor(self):
        conn = self.get_connection()
        return conn.cursor()

    def health_check(self) -> dict:
        if not MySQLRDSConfig.is_configured():
            return {'status': 'disabled', 'message': 'RDS not configured'}
        try:
            with self.cursor() as cur:
                cur.execute('SELECT 1 AS ok')
                cur.fetchone()
            return {
                'status': 'healthy',
                'host': MySQLRDSConfig.HOST,
                'database': MySQLRDSConfig.DATABASE,
                'read_only': MySQLRDSConfig.READ_ONLY,
            }
        except Exception as exc:
            return {'status': 'unhealthy', 'message': str(exc)}

    def close(self):
        with self._conn_lock:
            if self._connection:
                try:
                    self._connection.close()
                except Exception:
                    pass
                self._connection = None


mysql_rds = MySQLRDSManager()
