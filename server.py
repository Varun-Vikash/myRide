import os
import webbrowser
from functools import wraps
from flask import Flask, send_from_directory, render_template, redirect, request, url_for, flash, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from backend.config import PORT, HOST, DEBUG, ASSETS_DIR, STATIC_DIR, TEMPLATES_DIR, SECRET_KEY, SQLALCHEMY_DATABASE_URI, SQLALCHEMY_TRACK_MODIFICATIONS, INSTANCE_DIR
from backend.controllers.api_controller import api_bp
from backend.models import db, login_manager, User, Bus, BusRequest, BUS_STOPS


def role_required(role):
    """Decorator to restrict access to specific user roles without cross-tab redirects."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from flask import session
            user_id = session.get(f'{role}_user_id')
            user = User.query.get(int(user_id)) if user_id else None
            if not user or user.role != role:
                return redirect(f'/login/{role}')
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def create_app():
    app = Flask(
        __name__,
        template_folder=TEMPLATES_DIR,
        static_folder=STATIC_DIR,
        static_url_path='/static'
    )

    # App Configuration
    app.config['SECRET_KEY'] = SECRET_KEY
    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = SQLALCHEMY_TRACK_MODIFICATIONS

    # Ensure instance directory exists
    os.makedirs(INSTANCE_DIR, exist_ok=True)

    # Initialize Extensions
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'login_hub'

    # Multi-tab request loader for role-scoped user authentication
    @login_manager.request_loader
    def load_user_from_request(req):
        from flask import session
        path = req.path
        user_id = None
        if path.startswith('/admin') or path.startswith('/api/admin') or path == '/login/admin':
            user_id = session.get('admin_user_id')
        elif path.startswith('/driver') or path.startswith('/api/driver') or path == '/login/driver':
            user_id = session.get('driver_user_id')
        elif path.startswith('/student') or path.startswith('/api/student') or path == '/login/student':
            user_id = session.get('student_user_id')
        else:
            active_role = session.get('active_role')
            if active_role:
                user_id = session.get(f'{active_role}_user_id')
            if not user_id:
                user_id = session.get('_user_id')

        if user_id:
            try:
                return User.query.get(int(user_id))
            except Exception:
                return None
        return None

    # Create database tables and perform lightweight schema migrations
    with app.app_context():
        db.create_all()
        try:
            import sqlite3
            db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
            if 'sqlite:///' in db_uri:
                db_path = db_uri.replace('sqlite:///', '')
                if os.path.exists(db_path):
                    conn = sqlite3.connect(db_path)
                    c = conn.cursor()
                    c.execute("PRAGMA table_info(users)")
                    cols = [col[1] for col in c.fetchall()]
                    if 'raw_password' not in cols:
                        c.execute("ALTER TABLE users ADD COLUMN raw_password VARCHAR(120) DEFAULT ''")
                    # Backfill known seed passwords if empty
                    c.execute("UPDATE users SET raw_password = 'admin123' WHERE username = 'admin' AND (raw_password IS NULL OR raw_password = '')")
                    c.execute("UPDATE users SET raw_password = 'driver123' WHERE role = 'driver' AND (raw_password IS NULL OR raw_password = '')")
                    c.execute("UPDATE users SET raw_password = 'student123' WHERE role = 'student' AND (raw_password IS NULL OR raw_password = '')")
                    conn.commit()
                    conn.close()
        except Exception as _schema_err:
            print("[SCHEMA] Migration note:", _schema_err)

    # Register Modern API Blueprint
    app.register_blueprint(api_bp)

    @app.after_request
    def add_no_cache_headers(response):
        # Prevent browser caching of authenticated dashboards & API responses across multiple tabs
        if (request.path.startswith('/api/') or 
            request.path.startswith('/static/') or 
            request.path in ['/admin', '/driver', '/student', '/login', '/login/admin', '/login/driver', '/login/student']):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    # ──────────────────────────────────────────────
    # Serve Legacy & Static Asset Directories
    # ──────────────────────────────────────────────
    @app.route('/assets/<path:filename>')
    def serve_assets(filename):
        if filename.startswith('images/'):
            return send_from_directory(os.path.join(ASSETS_DIR, 'images'), filename[7:])
        elif filename.startswith('stylesheets/'):
            return send_from_directory(os.path.join(ASSETS_DIR, 'stylesheets'), filename[12:])
        if os.path.exists(os.path.join(ASSETS_DIR, 'images', filename)):
            return send_from_directory(os.path.join(ASSETS_DIR, 'images'), filename)
        return send_from_directory(ASSETS_DIR, filename)

    # ──────────────────────────────────────────────
    # Login & Multi-Role Hub Pages
    # ──────────────────────────────────────────────
    @app.route('/login', methods=['GET'])
    def login_hub():
        from flask import session
        admin_id = session.get('admin_user_id')
        driver_id = session.get('driver_user_id')
        student_id = session.get('student_user_id')

        admin_user = User.query.get(int(admin_id)) if admin_id else None
        driver_user = User.query.get(int(driver_id)) if driver_id else None
        student_user = User.query.get(int(student_id)) if student_id else None

        return render_template(
            'login_hub.html',
            admin_user=admin_user,
            driver_user=driver_user,
            student_user=student_user
        )

    @app.route('/login/admin', methods=['GET'])
    def login_admin_page():
        from flask import session
        admin_id = session.get('admin_user_id')
        if admin_id and User.query.filter_by(id=admin_id, role='admin').first():
            return redirect('/admin')
        return render_template('login_admin.html')

    @app.route('/login/driver', methods=['GET'])
    def login_driver_page():
        from flask import session
        driver_id = session.get('driver_user_id')
        if driver_id and User.query.filter_by(id=driver_id, role='driver').first():
            return redirect('/driver')
        return render_template('login_driver.html')

    @app.route('/login/student', methods=['GET'])
    def login_student_page():
        from flask import session
        student_id = session.get('student_user_id')
        if student_id and User.query.filter_by(id=student_id, role='student').first():
            return redirect('/student')
        return render_template('login_student.html')

    # ──────────────────────────────────────────────
    # Auth Actions & Peer Demo Convenience Endpoint
    # ──────────────────────────────────────────────
    @app.route('/auth/login', methods=['POST'])
    def auth_login():
        from flask import session
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        role = request.form.get('role', 'student')

        user = User.query.filter_by(username=username, role=role).first()
        if user and user.check_password(password):
            session[f'{role}_user_id'] = user.id
            session['active_role'] = role
            session.modified = True
            login_user(user)
            return redirect(f'/{role}')
        
        flash('Invalid username or password.', 'error')
        return redirect(f'/login/{role}')

    @app.route('/auth/demo-login')
    def demo_login():
        """Instant multi-role session bootstrapper for effortless peer presentations."""
        from flask import session
        admin = User.query.filter_by(username='admin', role='admin').first()
        driver = User.query.filter_by(username='driver1', role='driver').first()
        student = User.query.filter_by(username='student1', role='student').first()

        if admin:
            session['admin_user_id'] = admin.id
        if driver:
            session['driver_user_id'] = driver.id
        if student:
            session['student_user_id'] = student.id
        session['active_role'] = 'admin'
        session.modified = True

        target_role = request.args.get('role', 'all')
        if target_role in ['admin', 'driver', 'student']:
            return redirect(f'/{target_role}')
        return redirect('/login')

    @app.route('/logout')
    def auth_logout():
        from flask import session
        role = request.args.get('role')
        if not role:
            ref = request.referrer or ''
            if '/admin' in ref:
                role = 'admin'
            elif '/driver' in ref:
                role = 'driver'
            elif '/student' in ref:
                role = 'student'
            else:
                role = session.get('active_role', 'student')

        session.pop(f'{role}_user_id', None)
        if session.get('active_role') == role:
            session.pop('active_role', None)
        session.modified = True

        # Only flush Flask-Login if all role sessions are completely signed out
        if not (session.get('admin_user_id') or session.get('driver_user_id') or session.get('student_user_id')):
            logout_user()
            
        return redirect(f'/login/{role}')

    # ──────────────────────────────────────────────
    # Protected Dashboard Routes
    # ──────────────────────────────────────────────
    @app.route('/admin')
    @role_required('admin')
    def admin_dashboard():
        from flask import session
        user = User.query.get(session['admin_user_id'])
        return render_template('admin.html', user=user, bus_stops=BUS_STOPS)

    @app.route('/driver')
    @role_required('driver')
    def driver_dashboard():
        from flask import session
        user = User.query.get(session['driver_user_id'])
        return render_template('driver.html', user=user)

    @app.route('/student')
    @role_required('student')
    def student_dashboard():
        from flask import session
        user = User.query.get(session['student_user_id'])
        return render_template('student.html', user=user, bus_stops=BUS_STOPS)

    # ──────────────────────────────────────────────
    # Backward-compatible Legacy Map Routes
    # ──────────────────────────────────────────────
    @app.route('/map/tags/<int:level>')
    def legacy_tags(level):
        return redirect(f'/api/map/tags/{level}')

    @app.route('/map/legends/<int:level>')
    def legacy_legends(level):
        return redirect(f'/api/map/legends/{level}')

    @app.route('/map/search')
    def legacy_search():
        q = request.args.get('query', '')
        return redirect(f'/api/map/search?query={q}')

    @app.route('/map/bus_routes')
    def legacy_bus_routes():
        return redirect('/api/routes')

    @app.route('/map/bus_full_path')
    def legacy_bus_full_path():
        rid = request.args.get('route_id', 'route-a')
        return redirect(f'/api/routes/{rid}/path')

    @app.route('/map/location/<place_id>')
    def legacy_location(place_id):
        return redirect(f'/api/map/location/{place_id}')

    @app.route('/map/details/<place_id>')
    def legacy_details(place_id):
        lvl = request.args.get('level', '4')
        return redirect(f'/api/map/details/{place_id}?level={lvl}')

    @app.route('/map/direction')
    def legacy_direction():
        return redirect(f'/api/map/direction?{request.query_string.decode("utf-8")}')

    # ──────────────────────────────────────────────
    # Main Application Route (Public Map)
    # ──────────────────────────────────────────────
    @app.route('/')
    @app.route('/map')
    def index():
        return render_template('index.html')

    @app.route('/about')
    def about():
        return render_template('about.html')

    return app

app = create_app()

if __name__ == '__main__':
    print("=" * 70)
    print(" [TRANSIT] myRide@BIT Full-Stack Campus Shuttle Transit System")
    print(f" Starting enterprise full-stack server at: http://127.0.0.1:{PORT}")
    print(" Architecture: Flask REST API + SQLAlchemy + Flask-Login")
    print(" Dashboards: Admin | Driver | Student")
    print("=" * 70)
    try:
        webbrowser.open(f'http://127.0.0.1:{PORT}')
    except:
        pass
    app.run(host=HOST, port=PORT, debug=DEBUG)
