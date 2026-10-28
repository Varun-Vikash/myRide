"""
myRide@BIT — Database Seeder
Creates demo users, buses, and sample data for testing.

Usage:
    python seed_db.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import app
from backend.models import db, User, Bus


def seed():
    with app.app_context():
        # Drop and recreate all tables
        db.drop_all()
        db.create_all()
        print("[SEED] Database tables created.")

        # ── Create Admin User ──
        admin = User(username='admin', full_name='Admin', role='admin', phone='9876543210')
        admin.set_password('admin123')
        db.session.add(admin)
        print("[SEED] Admin user created: admin / admin123")

        # ── Create Driver Users ──
        drivers_data = [
            ('driver1', 'Rajesh Kumar', '9876500001'),
            ('driver2', 'Suresh Babu', '9876500002'),
            ('driver3', 'Mahesh Rajan', '9876500003'),
        ]
        drivers = []
        for uname, fname, phone in drivers_data:
            d = User(username=uname, full_name=fname, role='driver', phone=phone)
            d.set_password('driver123')
            db.session.add(d)
            drivers.append(d)
            print(f"[SEED] Driver user created: {uname} / driver123")

        # ── Create Student Users ──
        students_data = [
            ('student1', 'Varun Vikash S', '9876500011'),
            ('student2', 'Priya Sharma', '9876500012'),
            ('student3', 'Arun Kumar R', '9876500013'),
        ]
        for uname, fname, phone in students_data:
            s = User(username=uname, full_name=fname, role='student', phone=phone)
            s.set_password('student123')
            db.session.add(s)
            print(f"[SEED] Student user created: {uname} / student123")

        # Flush to get IDs
        db.session.flush()

        # ── Create Active Buses (EV Shuttles) ──
        buses_data = [
            ('Bus #101', 'route-a', 'Route A (Main Campus Loop)', 32, '#EF4444', drivers[0].id, 95.0, 'active'),
            ('Bus #202', 'route-b', 'Route B (Hostel Shuttle)', 32, '#3B82F6', drivers[1].id, 88.0, 'active'),
            ('Bus #303', 'route-c', 'Route C (Academic Express)', 32, '#10B981', drivers[2].id, 72.0, 'active'),
        ]
        for bus_no, route_id, route_name, cap, color, did, battery, bstatus in buses_data:
            b = Bus(bus_no=bus_no, route_id=route_id, route_name=route_name,
                    capacity=cap, color=color, driver_id=did, status='active',
                    battery_level=battery, bus_status=bstatus)
            db.session.add(b)
            print(f"[SEED] EV Bus created: {bus_no} -> {route_name} (Battery: {battery}%)")

        # ── Create Backup Buses (At Charging Station) ──
        backup_buses = [
            ('Bus #404', 'backup', 'Backup - Charging Station', 32, '#F59E0B', None, 100.0, 'backup'),
            ('Bus #505', 'backup', 'Backup - Charging Station', 32, '#8B5CF6', None, 100.0, 'backup'),
        ]
        for bus_no, route_id, route_name, cap, color, did, battery, bstatus in backup_buses:
            b = Bus(bus_no=bus_no, route_id=route_id, route_name=route_name,
                    capacity=cap, color=color, driver_id=did, status='active',
                    battery_level=battery, bus_status=bstatus)
            db.session.add(b)
            print(f"[SEED] Backup Bus created: {bus_no} (Battery: {battery}%, Status: {bstatus})")

        db.session.commit()
        print("\n" + "=" * 50)
        print(" [SEED] Database seeded successfully!")
        print("=" * 50)
        print("\n Demo Accounts:")
        print("  Admin    : admin    / admin123")
        print("  Driver 1 : driver1  / driver123")
        print("  Driver 2 : driver2  / driver123")
        print("  Driver 3 : driver3  / driver123")
        print("  Student 1: student1 / student123")
        print("  Student 2: student2 / student123")
        print("  Student 3: student3 / student123")
        print("\n EV Fleet:")
        print("  Bus #101 (Route A) - 95% charge")
        print("  Bus #202 (Route B) - 88% charge")
        print("  Bus #303 (Route C) - 72% charge")
        print("  Bus #404 (Backup)  - 100% charge [CHARGING STATION]")
        print("  Bus #505 (Backup)  - 100% charge [CHARGING STATION]")


if __name__ == '__main__':
    seed()
