# Push Notification System - Testing Checklist

## Pre-Testing Setup

### 1. Clear Browser Data
```
1. Open DevTools (F12)
2. Go to Application tab
3. Clear Storage:
   - [x] Local storage
   - [x] Session storage
   - [x] Service Workers
   - [x] Cache storage
4. Click "Clear site data"
5. Reload page
```

### 2. Reset Notification Permissions
```
Chrome:
1. Click lock icon in address bar
2. Click "Site settings"
3. Find "Notifications"
4. Set to "Ask (default)"

Firefox:
1. Click lock icon in address bar
2. Click "Clear permissions and cookies"
3. Confirm
```

---

## Test Scenarios

### ✅ Scenario 1: Before Login
**Expected Behavior**: No push notification elements visible

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Open app (not logged in) | No floating button visible | ⬜ |
| 2 | Check for OneSignal bell | No bell button visible | ⬜ |
| 3 | Check browser console | No push notification initialization logs | ⬜ |
| 4 | Check for permission prompts | No automatic permission dialogs | ⬜ |

**Pass Criteria**: ✅ No push notification UI or prompts before login

---

### ✅ Scenario 2: After Login
**Expected Behavior**: Push notification elements appear

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Login as student | Redirect to dashboard | ⬜ |
| 2 | Wait 2 seconds | Floating button appears (bottom-left) | ⬜ |
| 3 | Check button state | Blue gradient with bell icon | ⬜ |
| 4 | Check for OneSignal bell | Red bell button appears | ⬜ |
| 5 | Check console | "✅ OneSignal initialized successfully" | ⬜ |
| 6 | Hover over floating button | Tooltip shows "Click to enable..." | ⬜ |

**Pass Criteria**: ✅ Both buttons visible, no errors in console

---

### ✅ Scenario 3: Subscribe via Floating Button
**Expected Behavior**: Successful subscription with visual feedback

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Click floating button | Button shows loading spinner | ⬜ |
| 2 | Wait for permission dialog | Browser shows "Allow notifications?" | ⬜ |
| 3 | Click "Allow" | Permission granted | ⬜ |
| 4 | Wait for subscription | Button shows loading spinner | ⬜ |
| 5 | Check console logs | "OneSignal subscription: fulfilled" | ⬜ |
| 6 | Check console logs | "VAPID subscription: fulfilled" or warning | ⬜ |
| 7 | Check button state | Changes to green with checkmark | ⬜ |
| 8 | Check for badge | Small green dot in top-right corner | ⬜ |
| 9 | Check success message | Toast: "🔔 Successfully subscribed..." | ⬜ |
| 10 | Try clicking button again | Button is disabled, no action | ⬜ |
| 11 | Hover over button | Tooltip: "✓ Notifications Enabled" | ⬜ |

**Pass Criteria**: ✅ Button changes to green, success message shown, no errors

---

### ✅ Scenario 4: Subscribe via OneSignal Bell
**Expected Behavior**: OneSignal native subscription flow

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Click OneSignal bell button | OneSignal dialog appears | ⬜ |
| 2 | Click subscribe in dialog | Browser permission dialog shows | ⬜ |
| 3 | Click "Allow" | Permission granted | ⬜ |
| 4 | Wait for subscription | Bell button changes to subscribed | ⬜ |
| 5 | Check floating button | Also changes to green checkmark | ⬜ |
| 6 | Check console | "Backend notified of OneSignal subscription" | ⬜ |

**Pass Criteria**: ✅ Both buttons show subscribed state

---

### ✅ Scenario 5: Permission Denied
**Expected Behavior**: Graceful error handling

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Click floating button | Permission dialog appears | ⬜ |
| 2 | Click "Block" | Permission denied | ⬜ |
| 3 | Check error message | "Notification permission denied..." | ⬜ |
| 4 | Check button state | Returns to blue (unsubscribed) | ⬜ |
| 5 | Check console | Error logged, no crashes | ⬜ |

**Pass Criteria**: ✅ Clear error message, app doesn't crash

---

### ✅ Scenario 6: Page Refresh (Already Subscribed)
**Expected Behavior**: Correct state persists

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Subscribe successfully | Button is green with checkmark | ⬜ |
| 2 | Refresh page (F5) | Page reloads | ⬜ |
| 3 | Wait for page load | Dashboard loads | ⬜ |
| 4 | Check floating button | Still green with checkmark | ⬜ |
| 5 | Check button state | Still disabled | ⬜ |
| 6 | Hover over button | Tooltip: "✓ Notifications Enabled" | ⬜ |

**Pass Criteria**: ✅ Subscription state persists across refreshes

---

### ✅ Scenario 7: Logout and Login Again
**Expected Behavior**: Subscription persists for user

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Subscribe successfully | Button is green | ⬜ |
| 2 | Logout | Redirect to login page | ⬜ |
| 3 | Check for buttons | No buttons visible (logged out) | ⬜ |
| 4 | Login again | Redirect to dashboard | ⬜ |
| 5 | Check floating button | Green with checkmark (subscribed) | ⬜ |

**Pass Criteria**: ✅ Subscription recognized after re-login

---

### ✅ Scenario 8: Send Test Notification
**Expected Behavior**: User receives notification

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Subscribe successfully | Green checkmark button | ⬜ |
| 2 | Send test notification (admin/API) | Notification sent | ⬜ |
| 3 | Check for notification | Notification appears on device | ⬜ |
| 4 | Check notification content | Title and body correct | ⬜ |
| 5 | Click notification | Opens app to correct page | ⬜ |
| 6 | Check console | No errors | ⬜ |

**Pass Criteria**: ✅ Notification received and displayed correctly

---

### ✅ Scenario 9: VAPID Not Configured (Optional)
**Expected Behavior**: OneSignal works, VAPID fails gracefully

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Ensure VAPID not configured | Backend has no VAPID endpoints | ⬜ |
| 2 | Click subscribe button | Permission dialog appears | ⬜ |
| 3 | Click "Allow" | Permission granted | ⬜ |
| 4 | Check console | "VAPID initialization failed..." (warning) | ⬜ |
| 5 | Check console | "OneSignal subscription: fulfilled" | ⬜ |
| 6 | Check success message | "Successfully subscribed! (OneSignal)" | ⬜ |
| 7 | Check button state | Green with checkmark | ⬜ |

**Pass Criteria**: ✅ OneSignal works even if VAPID fails

---

### ✅ Scenario 10: Mobile Responsive
**Expected Behavior**: Works on mobile devices

| Step | Action | Expected Result | Status |
|------|--------|----------------|--------|
| 1 | Open on mobile device | Dashboard loads | ⬜ |
| 2 | Check floating button | Visible at bottom-left | ⬜ |
| 3 | Check button size | 56px × 56px (touchable) | ⬜ |
| 4 | Tap button | Permission dialog appears | ⬜ |
| 5 | Allow permission | Subscription succeeds | ⬜ |
| 6 | Check button state | Green with checkmark | ⬜ |

**Pass Criteria**: ✅ Works correctly on mobile

---

## Console Logs to Verify

### Successful Subscription
```javascript
✅ OneSignal initialized successfully
✅ VAPID service initialized
OneSignal subscription: {status: "fulfilled", value: true}
VAPID subscription: {status: "fulfilled", value: true}
✅ Backend notified of OneSignal subscription
```

### OneSignal Only (VAPID Failed)
```javascript
✅ OneSignal initialized successfully
⚠️ VAPID initialization failed, will use OneSignal only
OneSignal subscription: {status: "fulfilled", value: true}
VAPID subscription: {status: "rejected", reason: Error}
✅ Backend notified of OneSignal subscription
```

---

## Network Requests to Verify

### During Subscription
```
POST /api/notifications/onesignal/subscribe
Headers:
  Authorization: Bearer <token>
Body:
  {
    "player_id": "abc123...",
    "onesignal_user_id": "abc123..."
  }
Response:
  { "success": true }
```

---

## Browser Compatibility Testing

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | Latest | ⬜ | Full support expected |
| Firefox | Latest | ⬜ | Full support expected |
| Safari | Latest | ⬜ | Limited push support |
| Edge | Latest | ⬜ | Full support expected |
| Mobile Chrome | Latest | ⬜ | Test on Android |
| Mobile Safari | Latest | ⬜ | Limited support |

---

## Known Issues / Limitations

### Safari
- Push notifications have limited support
- May require additional configuration
- OneSignal handles Safari differently

### Mobile Safari (iOS)
- Web push notifications not supported on iOS < 16.4
- OneSignal uses alternative methods

### HTTP vs HTTPS
- Push notifications require HTTPS
- Won't work on localhost without special setup

---

## Troubleshooting Guide

### Button Not Appearing
**Check**:
- [ ] User is logged in
- [ ] Console for errors
- [ ] Component is mounted

### Permission Dialog Not Showing
**Check**:
- [ ] Browser hasn't already blocked notifications
- [ ] Site is HTTPS (not HTTP)
- [ ] No console errors

### Subscription Failing
**Check**:
- [ ] Backend is running
- [ ] Auth token is valid
- [ ] Network tab for failed requests
- [ ] Console for specific errors

### Notifications Not Received
**Check**:
- [ ] User is subscribed (check OneSignal dashboard)
- [ ] Service worker is active
- [ ] Browser is online
- [ ] Notification payload is correct

---

## Success Criteria

✅ **All scenarios pass**
✅ **No console errors** (warnings are OK)
✅ **Button states correct**
✅ **Notifications received**
✅ **Works on multiple browsers**
✅ **Mobile responsive**
✅ **Graceful error handling**

---

## Final Checklist

- [ ] All test scenarios completed
- [ ] No blocking errors in console
- [ ] Button appears and functions correctly
- [ ] Subscription persists across refreshes
- [ ] Backend receives subscription data
- [ ] Test notification received successfully
- [ ] Mobile testing completed
- [ ] Multiple browsers tested
- [ ] Documentation reviewed
- [ ] Ready for production ✅

---

## Report Template

```
Test Date: ___________
Tester: ___________
Environment: ___________

Scenarios Passed: ___ / 10
Browsers Tested: ___________
Mobile Tested: Yes / No

Issues Found:
1. ___________
2. ___________

Notes:
___________

Status: ✅ PASS / ❌ FAIL
```
