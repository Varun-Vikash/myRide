import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, 'app', 'assets')
LIB_ASSETS_DIR = os.path.join(BASE_DIR, 'lib', 'assets')
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')
INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')

PORT = 3000
HOST = '0.0.0.0'
DEBUG = False

# Authentication & Database
SECRET_KEY = 'myride-at-bit-2026-campus-transit-secret-key'
SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(INSTANCE_DIR, 'geobits.db')
SQLALCHEMY_TRACK_MODIFICATIONS = False

# Campus Map Calibration
BASE_MAP_WIDTH = 3420
BASE_MAP_HEIGHT = 3876
DEFAULT_ZOOM_LEVEL = 4
DEFAULT_CENTER_LEFT = 1950
DEFAULT_CENTER_TOP = 1800
METERS_PER_PIXEL = 0.28960526315789475
