# LocaTrack — Ionic + Capacitor

A lightweight location-distance app for Android. It gets a GPS fix only when the user taps **Get My Location**, saves up to 50 recent points on-device, and calculates straight-line distance from the immediately previous saved point.

## Requirements
- Node.js LTS (18.19+ or 20+ recommended)
- Android Studio with Android SDK
- A physical Android phone for meaningful GPS testing

## Install dependencies
```bash
npm install
```

## Run in browser
```bash
npm start
```
Browser location requires HTTPS or localhost and permission. Native Android is recommended for phone testing.

## Create Android project
```bash
npx cap add android
npm run android:sync
npm run android:open
```
In Android Studio, wait for Gradle sync, connect your phone with USB debugging enabled, then press Run.

## Build a shareable APK
In Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
The debug APK is usually at:
`android/app/build/outputs/apk/debug/app-debug.apk`

You can copy that APK to another Android phone and install it. Android may ask you to allow installation from that file manager/browser.

## Location permission
Capacitor's Geolocation plugin requests location permission when needed. On Android, the app only needs foreground location access. It does not request background location.

If permission was denied, enable Location permission for LocaTrack in Android Settings > Apps > LocaTrack > Permissions.

## How distance works
- First successful reading: saved as the starting point; no distance is shown yet.
- Each later reading: distance is calculated from the previous saved reading using the Haversine formula (great-circle / straight-line surface distance).
- The latest reading becomes the new previous point for the next measurement.
- GPS accuracy is displayed because indoor or obstructed readings can be imprecise.
- Distance is not road distance and does not continuously track movement.

## Performance and privacy
- No map tiles, background GPS watcher, analytics, advertising, camera, microphone, or network service.
- The app keeps the most recent 50 location records in local storage on the phone.
- Clearing history removes the saved records from this app.
- High-accuracy GPS is requested only after a user tap; GPS hardware may take a little longer and use more power while acquiring a fix.

## Notes
This project is a complete source project, not a prebuilt APK. Android Studio/Android SDK must generate the APK on your computer.
