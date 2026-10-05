# Shiftboard iPhone / CarPlay companion

This is the first native Shiftboard companion app. It keeps the existing web Shiftboard as the main system and adds a small iPhone app plus a WidgetKit widget designed to be suitable for CarPlay.

## What is included

- Tony-only Supabase sign-in using the same Shiftboard manager account.
- Business pulse: workshop sales, target, variance, sites ahead/behind and freshness date.
- A systemSmall WidgetKit widget. Apple can surface compatible small iPhone widgets in CarPlay.
- Shared secure session storage using the iOS Keychain.
- Shared cached pulse data using an App Group.
- A Siri/App Intent shortcut: "How are the workshops doing?"
- The backend uses the authenticated shiftboard-car-pulse Supabase Edge Function. No service-role key is shipped in the app.

## Build

A Mac with current Xcode is required for the final native build/signing step.

1. Install XcodeGen: brew install xcodegen
2. In this folder run: xcodegen generate
3. Open ShiftboardCompanion.xcodeproj in Xcode.
4. Set your Apple Developer Team for both targets.
5. Confirm the App Group group.com.neautoservices.shiftboard exists for both targets.
6. Confirm the shared Keychain access group entitlement is enabled for both targets.
7. Build to Tony's iPhone.
8. Sign in once with the existing Shiftboard manager account.
9. Add the Shiftboard small widget on the iPhone. On supported CarPlay systems, enable that widget in the CarPlay Widgets screen.

The password is never stored. Supabase access and refresh tokens are stored in the shared Keychain.

## Data shown in the car

The widget intentionally contains management-summary information only. It does not show employee names, pay rates, sickness details or other individual employee data.
