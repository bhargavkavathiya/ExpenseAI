# Mobile (React Native / Expo) — UC10

## Run
```bash
npm install
npx expo start
```

Scan the QR with Expo Go (Android or physical iOS device — **not** iOS Simulator, the camera will not work there).

## Configure backend URL
Edit `app.json` → `expo.extra.apiBase`, or export `EXPO_PUBLIC_API_BASE` before `expo start`.

## Layout
```
App.tsx                Root nav (native-stack). Screens: Login → Submit → Ack → Result
src/
  api.ts               Axios client with JWT injection from SecureStore
  glossary.ts          Acronym first-occurrence expansion (FR-10.*)
  screens/
    LoginScreen.tsx
    SubmitScreen.tsx   camera + gallery pick, upload
    AckScreen.tsx      poll /expenses/{ref_id} every 1.5s
    ResultScreen.tsx   status badge, confidence meter, per-module breakdown
```

## Notes
- iOS Simulator does not expose a working camera — demo on a physical device or Android.
- Each screen calls `resetScreen(name)` so acronyms re-expand on each visit.
