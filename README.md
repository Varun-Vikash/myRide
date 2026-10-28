# myRide@BIT: Real-Time Campus Electric Shuttle Bus Tracking, Navigation & Dynamic Dispatch System

**myRide@BIT** is an enterprise-grade campus transit tracking and dynamic demand-responsive dispatch platform developed for **Bannari Amman Institute of Technology (BIT)**. It features real-time 60 FPS multi-shuttle bus simulation, shortest-path Dijkstra graph routing across an 80-node calibrated campus road network, automated EV battery depletion monitoring with standby depot swaps, and role-based portals for Administrators, Drivers, and Students.

---

## 👨‍💻 Project Details

- **Author / Candidate:** VARUN VIKASH S (`7376232IT275`)
- **Supervisor & HoD:** Dr. NAVEENA S, Professor & Head, Department of Information Technology
- **Institution:** Bannari Amman Institute of Technology (Autonomous, Affiliated to Anna University, Chennai)
- **Year / Month:** October 2026

---

## 🚀 Installation & Quick Start

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd geobits-main
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Initialize & Seed Database (First-Time Setup)
Initializes default accounts (Admin, Drivers, Students) and shuttle bus fleet configurations:
```bash
python seed_db.py
```

### 4. Start the Application Server
```bash
python run.py
```
Boots the server and opens your browser at **[http://127.0.0.1:3000](http://127.0.0.1:3000)**.

---

## 🌐 Portal Endpoints

| Portal | Route | Description | Default Credentials |
| :--- | :--- | :--- | :--- |
| **Interactive Map** | `/` | 60 FPS live campus navigation & bus tracking | Public access |
| **Student Portal** | `/student` | On-demand ride hailing & nearest-vehicle dispatch | `student1` / `student123` |
| **Driver Portal** | `/driver` | Cockpit HUD, active route navigation & passenger manifest | `driver1` / `driver123` |
| **Admin Portal** | `/admin` | Fleet oversight, live battery telemetry & analytics | `admin` / `admin123` |
| **About Page** | `/about` | Campus building legends and platform details | Public access |

---

## 📁 Repository Architecture

```
├── backend/                       # Python Flask backend service modules
│   ├── controllers/               # REST API endpoints (routes, buses, dispatch, requests)
│   ├── services/                  # Dijkstra graph router & shuttle simulation services
│   ├── config.py                  # Server configuration and environment paths
│   └── models.py                  # SQLAlchemy ORM models (Users, Buses, RideRequests)
│
├── static/                        # Frontend assets
│   ├── css/                       # Glassmorphism UI styling
│   └── js/                        # Leaflet GIS map, 60 FPS simulation, dashboard scripts
│
├── templates/                     # Jinja2 HTML templates
│   ├── index.html                 # Public interactive campus transit map
│   ├── student.html               # Student on-demand hailing interface
│   ├── driver.html                # Driver cockpit & dispatch HUD
│   ├── admin.html                 # Fleet operations management center
│   └── login_*.html               # Role-scoped authentication views
│
├── app/assets/                    # Vector map tiles, SVGs, and transit icons
├── lib/assets/                    # Topological campus road junction and edge matrices
├── instance/                      # Local SQLite database directory
│
├── run.py                         # Application bootstrapper
├── server.py                      # Flask application factory
├── seed_db.py                     # Database population utility
├── requirements.txt               # Python package dependencies
├── README.md                      # Documentation
├── .gitignore                     # Git ignore rules
└── .gitattributes                 # Git configuration
```
