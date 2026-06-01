"""AWS RDS MySQL configuration for read-only organization data."""
import os


class MySQLRDSConfig:
    """Connection settings for the master student database (AWS RDS)."""

    HOST = os.getenv('DB_HOST', os.getenv('MYSQL_RDS_HOST', ''))
    PORT = int(os.getenv('DB_PORT', os.getenv('MYSQL_RDS_PORT', '3306')))
    USER = os.getenv('DB_USER', os.getenv('MYSQL_RDS_USER', ''))
    PASSWORD = os.getenv('DB_PASSWORD', os.getenv('MYSQL_RDS_PASSWORD', ''))
    DATABASE = os.getenv('DB_NAME', os.getenv('MYSQL_RDS_DATABASE', 'student_database'))
    SSL = os.getenv('DB_SSL', os.getenv('MYSQL_RDS_SSL', 'true')).lower() in ('1', 'true', 'yes')
    READ_ONLY = os.getenv('MYSQL_RDS_READ_ONLY', 'true').lower() in ('1', 'true', 'yes')
    CONNECT_TIMEOUT = int(os.getenv('MYSQL_RDS_CONNECT_TIMEOUT', '15'))
    READ_TIMEOUT = int(os.getenv('MYSQL_RDS_READ_TIMEOUT', '30'))

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.HOST and cls.USER and cls.DATABASE)

    @classmethod
    def use_rds_org_data(cls) -> bool:
        """When true, campuses/courses/batches/student lists come from RDS."""
        flag = os.getenv('USE_RDS_ORG_DATA', 'true').lower() in ('1', 'true', 'yes')
        return flag and cls.is_configured()

    @classmethod
    def connection_kwargs(cls) -> dict:
        kwargs = {
            'host': cls.HOST,
            'port': cls.PORT,
            'user': cls.USER,
            'password': cls.PASSWORD,
            'database': cls.DATABASE,
            'connect_timeout': cls.CONNECT_TIMEOUT,
            'read_timeout': cls.READ_TIMEOUT,
            'charset': 'utf8mb4',
            'cursorclass': None,  # set by caller
        }
        if cls.SSL:
            kwargs['ssl'] = {'ssl': True}
        return kwargs
