"""
myRide@BIT — Real-Time Campus Electric Shuttle Bus Tracking & Dynamic Dispatch System
Root execution script. Boots the full-stack server and opens the browser.
"""
from server import app
from backend.config import PORT, HOST, DEBUG
import webbrowser

if __name__ == '__main__':
    print("=" * 70)
    print(" [TRANSIT] myRide@BIT Full-Stack Campus Shuttle Transit System")
    print(f" Starting enterprise full-stack server at: http://127.0.0.1:{PORT}")
    print("=" * 70)
    try:
        webbrowser.open(f'http://127.0.0.1:{PORT}')
    except:
        pass
    app.run(host=HOST, port=PORT, debug=DEBUG)
