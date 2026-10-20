# Frontend:
- React + Vite — Shared frontend for web and Android.
- Tailwind CSS — Responsive, mobile-first design.
- Capacitor — Package the React application as a native Android APK.
- Lucide React — Icons and UI elements.
- Camera / File Upload — Capture receipts directly from the Android phone or upload images on the website.


# Backend:
- Python + FastAPI — Handle receipt processing, Gemini requests, and warranty calculations.
- SQLite — Lightweight local storage for receipts and warranty records; no database server needed.
- Docker — Consistent backend development environment.
- Sentry — Error and performance monitoring.
- Uvicorn — Run the FastAPI server.


# APIs:


- Google Gemini API (Free Tier) — Computer vision, receipt analysis, and structured information extraction.
- Capacitor Camera API — Access the Android camera and photo gallery. 
- Custom REST API — Connect the website and Android application to FastAPI.
- Capacitor Local Notifications API — Warranty-expiration reminders on Android.
- Browser Notifications API — Optional website reminders, subject to browser permissions and support.