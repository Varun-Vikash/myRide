from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()
login_manager = LoginManager()


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'admin', 'driver', 'student'
    phone = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    assigned_bus = db.relationship('Bus', backref='driver', uselist=False, foreign_keys='Bus.driver_id')
    bus_requests = db.relationship('BusRequest', backref='student', foreign_keys='BusRequest.student_id')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'full_name': self.full_name,
            'role': self.role,
            'phone': self.phone,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Bus(db.Model):
    __tablename__ = 'buses'

    id = db.Column(db.Integer, primary_key=True)
    bus_no = db.Column(db.String(20), unique=True, nullable=False)
    route_id = db.Column(db.String(20), nullable=False)
    route_name = db.Column(db.String(100), default='')
    capacity = db.Column(db.Integer, default=32)
    color = db.Column(db.String(10), default='#7B68EE')
    driver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    status = db.Column(db.String(20), default='active')  # 'active', 'inactive'
    battery_level = db.Column(db.Float, default=100.0)  # 0-100% EV charge
    bus_status = db.Column(db.String(30), default='active')  # active, charging, backup, en_route_pickup, returning_to_charge
    lap_count = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'bus_no': self.bus_no,
            'route_id': self.route_id,
            'route_name': self.route_name,
            'capacity': self.capacity,
            'color': self.color,
            'driver_id': self.driver_id,
            'driver_name': self.driver.full_name if self.driver else None,
            'status': self.status,
            'battery_level': round(self.battery_level, 1),
            'bus_status': self.bus_status,
            'lap_count': self.lap_count
        }


class BusRequest(db.Model):
    __tablename__ = 'bus_requests'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    pickup_stop = db.Column(db.String(120), nullable=False)
    drop_stop = db.Column(db.String(120), nullable=False)
    bus_id = db.Column(db.Integer, db.ForeignKey('buses.id'), nullable=True)
    driver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    status = db.Column(db.String(20), default='pending')  # pending, assigned, acknowledged, completed, cancelled
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    bus = db.relationship('Bus', backref='requests')
    assigned_driver = db.relationship('User', foreign_keys=[driver_id], backref='driver_requests')

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student.full_name if self.student else None,
            'pickup_stop': self.pickup_stop,
            'drop_stop': self.drop_stop,
            'bus_id': self.bus_id,
            'bus_no': self.bus.bus_no if self.bus else None,
            'driver_id': self.driver_id,
            'driver_name': self.assigned_driver.full_name if self.assigned_driver else None,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


@login_manager.user_loader
def load_user(user_id):
    """Role-aware user loader for multi-tab simultaneous authentication."""
    from flask import session, request
    try:
        path = request.path if request else ''
        role_uid = None
        if path.startswith('/admin') or path.startswith('/api/admin') or path == '/login/admin':
            role_uid = session.get('admin_user_id')
        elif path.startswith('/driver') or path.startswith('/api/driver') or path == '/login/driver':
            role_uid = session.get('driver_user_id')
        elif path.startswith('/student') or path.startswith('/api/student') or path == '/login/student':
            role_uid = session.get('student_user_id')
        else:
            active_role = session.get('active_role')
            if active_role:
                role_uid = session.get(f'{active_role}_user_id')
            if not role_uid:
                role_uid = user_id

        target_id = int(role_uid) if role_uid else int(user_id)
        return User.query.get(target_id)
    except Exception:
        try:
            return User.query.get(int(user_id)) if user_id else None
        except Exception:
            return None


# List of available campus bus stops for pickup/drop selection
BUS_STOPS = [
    'Main Gate Station',
    'Day Scholar Bus Stand',
    'Principal & Dean Office',
    'AS Main Block',
    'AS Academic RIBs',
    'Mechanical Engineering Block',
    'Fashion Tech Centre',
    'Main Store Complex',
    'Boys Hostel Station',
    'Boys Dining Mess',
    'Central Cafeteria',
    'Main Auditorium',
    'Central Library',
    'IB Academic Block',
    'Sports & Football Arena',
    'Girls Hostel Complex',
    'West Parking Bay',
    'Campus Medical Centre',
    'West Gate Terminal'
]
