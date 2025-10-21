# 🎯 Testing Guide - beta-integrated.html

## How to Test the Integrated App

### 🚀 Quick Start (2 minutes)

1. **Open File:** `/source/beta-integrated.html` in browser
2. **Wait:** App loads data (< 2 seconds)
3. **Test:** Click buttons, navigate pages, toggle theme

---

## 📱 Feature Testing Checklist

### Navigation (5 min)
- [ ] Click "Previous" button (should go to page 603)
- [ ] Click "Next" button (should go to page 2)
- [ ] Page counter shows "Page 1 / 604"
- [ ] Previous button disabled on page 1
- [ ] Next button disabled on page 604
- [ ] Press arrow left key (goes to previous)
- [ ] Press arrow right key (goes to next)
- [ ] Enter "100" in Go To box and press Enter (goes to page 100)
- [ ] Enter "605" in Go To box (should not navigate)
- [ ] Enter "0" in Go To box (should not navigate)

### Memorization (5 min)
- [ ] Click "Mark as Memorized" button
- [ ] Button text changes to "Memorized ✓"
- [ ] Button color changes to green
- [ ] Counter updates (1/604)
- [ ] Progress bar moves slightly
- [ ] Click button again
- [ ] Button returns to "Mark as Memorized"
- [ ] Button color returns to blue
- [ ] Counter updates back to (0/604)
- [ ] Click 10 times and see counter go to 10

### Progress Display (5 min)
- [ ] Progress bar visible with width 0%
- [ ] After marking pages, bar increases
- [ ] Percentage shows correct calculation
- [ ] Memorized count matches
- [ ] Remaining count is 604 minus memorized
- [ ] After 302 pages, bar at 50%
- [ ] After 604 pages, bar at 100%

### Theme Toggle (3 min)
- [ ] Light mode background is white
- [ ] Click moon icon
- [ ] Dark mode background is dark gray
- [ ] Text colors invert correctly
- [ ] Cards have dark backgrounds
- [ ] All icons visible in dark mode
- [ ] Smooth transition between themes
- [ ] Click sun icon to go back to light

### View Switching (3 min)
- [ ] Click book icon (chart icon) in header
- [ ] Switches to Stats View
- [ ] Quran page disappears
- [ ] Dashboard appears
- [ ] Memorized grid appears
- [ ] Settings appear
- [ ] Click chart icon again
- [ ] Back to Read View
- [ ] Quran page shows
- [ ] Navigation visible
- [ ] Progress bar visible

### Dashboard (5 min) - In Stats View
- [ ] Progress bar shows 0% (unless you marked pages)
- [ ] 30 Juz boxes visible
- [ ] All Juz boxes gray (not memorized)
- [ ] After marking page 1: Juz 1 partially colored
- [ ] After marking pages 20: Juz 1 fully green
- [ ] Click Juz 15 box
- [ ] Should navigate to page around 281
- [ ] Back in Read View, page shows 281
- [ ] Pages per day shows "1"
- [ ] Estimated days shows "604"

### Memorized Grid (5 min) - In Stats View
- [ ] See grid of 604 page cells
- [ ] Cells are tiny (responsive grid)
- [ ] All cells gray initially
- [ ] After marking page 100: cell 100 is green
- [ ] Hover over any cell: cell scales up
- [ ] Click cell 200: navigates to page 200
- [ ] Read View shows page 200
- [ ] Cell 200 shows as memorized (green)

### Settings (5 min) - In Stats View
- [ ] "Revision Days" input shows "30"
- [ ] Change to "60" and see value update
- [ ] "Pages per Day" input shows "1"
- [ ] Change to "5" and see value update
- [ ] Tajweed toggle is checked
- [ ] Click toggle to uncheck
- [ ] Click toggle to check again
- [ ] "Export Data" button visible and clickable
- [ ] "Import Data" button visible and clickable
- [ ] "Reset All" button visible and clickable

### Status Indicators (3 min)
- [ ] Shows "Memorized" count
- [ ] Shows "Remaining" count
- [ ] Shows "Progress" percentage
- [ ] Counts add up to 604
- [ ] Three cards visible
- [ ] Each card has different color

### Audio Recording (2 min) - In Read View
- [ ] "Start Recording" button visible
- [ ] Click button: text changes to "Stop Recording"
- [ ] Button color changes to red
- [ ] Click again: text changes to "Start Recording"
- [ ] Button color back to blue
- [ ] Audio info text visible below button

---

## 🎨 Responsive Design Testing

### Mobile View (320-640px)
1. **Setup:** Resize browser to 320px width
   - [ ] Page loads without errors
   - [ ] No horizontal scrolling
   - [ ] All content visible
   - [ ] Buttons full width or at least 44px wide
   - [ ] Text is readable (not too small)
   - [ ] Single column layouts
   - [ ] Status cards stack vertically

2. **Navigation Mobile:** (at 320px width)
   - [ ] Navigation buttons still work
   - [ ] Previous/Next buttons readable
   - [ ] Go To input and button fit without scroll
   - [ ] Page counter visible

3. **Grid Mobile:** (at 320px width in Stats View)
   - [ ] Memorized grid visible and responsive
   - [ ] Grid cells small but visible
   - [ ] Can scroll through grid
   - [ ] Cells still clickable

4. **Dashboard Mobile:** (at 320px width in Stats View)
   - [ ] Juz grid shows all 30 Juz
   - [ ] No text overflow
   - [ ] Cards visible

### Tablet View (768px)
1. **Setup:** Resize to 768px width
   - [ ] 2-column layouts appear
   - [ ] More spacing than mobile
   - [ ] All content visible
   - [ ] Better readability than mobile

### Desktop View (1024px+)
1. **Setup:** Resize to 1280px width
   - [ ] Multi-column layouts
   - [ ] Maximum width container (centered)
   - [ ] Full 3-column Juz grid visible
   - [ ] Optimal spacing for reading

---

## 🌙 Dark Mode Testing (All Views)

### Colors Check:
- [ ] White backgrounds → Dark gray
- [ ] Black text → White text
- [ ] Gray text → Light gray text
- [ ] Card shadows still visible
- [ ] Buttons still visible
- [ ] All icons visible
- [ ] Progress bars visible
- [ ] Input fields visible with borders
- [ ] Color contrast acceptable (WCAG AA)

### Transitions:
- [ ] Click theme button
- [ ] Colors smoothly transition
- [ ] No jarring color changes
- [ ] Transition takes ~0.3 seconds

---

## 💾 Data Persistence Testing

### Test 1: Page Navigation
1. Mark page 50 as memorized
2. Navigate to page 100
3. Refresh browser (Cmd+R or Ctrl+R)
4. **Check:** Page 50 still marked as memorized
5. **Check:** Progress counter shows 1/604

### Test 2: Theme Preference
1. Switch to dark mode
2. Refresh browser
3. **Check:** App opens in dark mode

### Test 3: Navigation State
1. Navigate to page 200
2. Refresh browser
3. **Check:** App opens on page 200

### Test 4: Multiple Pages
1. Mark pages: 1, 50, 100, 200, 300, 400, 500
2. Refresh browser
3. **Check:** All 7 pages still marked
4. **Check:** Progress shows 7/604

### Test 5: Settings
1. Change Pages Per Day to 10
2. Change Revision Days to 90
3. Uncheck Tajweed
4. Refresh browser
5. **Check:** All settings persisted

---

## ⌨️ Keyboard Shortcuts Testing

- [ ] Press **←** arrow: Previous page
- [ ] Press **→** arrow: Next page
- [ ] Enter page number and press **Enter**: Go to page
- [ ] All shortcuts work regardless of view
- [ ] All shortcuts work with focus on different elements

---

## 🔍 Browser Console Testing

### Check for Errors:
1. Open browser console: **F12** or **Cmd+Option+I**
2. Look for any red error messages
3. Look for `[Murajah]` log messages (green)
4. **Expected messages:**
   - "[Murajah] IndexedDB initialized"
   - "[Murajah] Loaded memorized pages: [...]"
   - "[Murajah] Integrated app initialized successfully"

### No Errors Should Show:
- [ ] No red error messages
- [ ] No JavaScript exceptions
- [ ] No network errors
- [ ] No CSS errors

---

## 🎯 Component Visibility

### Read View Should Show:
- [ ] Header with logo, status, theme toggle, view toggle
- [ ] Quran page display area
- [ ] Previous/Next buttons
- [ ] Go To page input
- [ ] Memorize button
- [ ] Progress bar
- [ ] Status indicator cards
- [ ] Mistakes tracker section
- [ ] Audio recording section
- [ ] Footer

### Stats View Should Show:
- [ ] Header with logo, status, theme toggle, view toggle
- [ ] Status indicator cards
- [ ] Dashboard with progress bar and Juz grid
- [ ] Memorized grid (604 pages)
- [ ] Settings section
- [ ] Footer

### Both Views Should Have:
- [ ] Header (sticky at top)
- [ ] Main content area
- [ ] Footer

---

## 📊 Performance Testing

### Load Time:
- [ ] App loads in < 2 seconds
- [ ] No loading spinner for more than 2 seconds
- [ ] Page feels responsive

### Interaction Response:
- [ ] Button clicks respond immediately (< 100ms)
- [ ] Page navigation feels instant
- [ ] Theme toggle is quick
- [ ] View switching is quick
- [ ] No lag when typing in inputs

### Animations:
- [ ] Progress bar smoothly animates (0.3s)
- [ ] Theme transition is smooth (0.3s)
- [ ] No stuttering or frame drops
- [ ] Hover effects respond immediately

---

## 🐛 Bug Hunting

### Navigation Edge Cases:
- [ ] Pressing Previous on page 1 does nothing
- [ ] Pressing Next on page 604 does nothing
- [ ] Go To with "0" doesn't navigate
- [ ] Go To with "605" doesn't navigate
- [ ] Go To with "abc" doesn't navigate
- [ ] Go To with empty input doesn't navigate
- [ ] Go To with decimal "100.5" navigates to 100

### Memorization Edge Cases:
- [ ] Same page marked twice doesn't break counter
- [ ] Unmarking reduces counter correctly
- [ ] Marking all 604 pages works
- [ ] Unmarking all pages works
- [ ] Counter never goes negative
- [ ] Counter never exceeds 604

### Display Issues:
- [ ] No overlapping text anywhere
- [ ] No cut-off buttons or inputs
- [ ] No horizontal scrolling on any view
- [ ] No vertical scroll at 100vh views
- [ ] All text readable (not too small)

---

## ✅ Final Verification

| Test | Status | Notes |
|------|--------|-------|
| Navigation works | [ ] | |
| Memorization works | [ ] | |
| Theme toggle works | [ ] | |
| View switching works | [ ] | |
| Dashboard displays | [ ] | |
| Grid displays | [ ] | |
| Settings work | [ ] | |
| Mobile responsive | [ ] | |
| Tablet responsive | [ ] | |
| Desktop responsive | [ ] | |
| Dark mode works | [ ] | |
| Data persists | [ ] | |
| No console errors | [ ] | |
| Performance good | [ ] | |
| All buttons work | [ ] | |
| All inputs work | [ ] | |

---

## 🎉 Sign-Off

When all tests pass:
- [ ] App is ready for Phase 5 (Quran data integration)
- [ ] No critical bugs found
- [ ] All features working as designed
- [ ] Performance acceptable
- [ ] Responsive design verified

**Tester Name:** __________________
**Date Tested:** __________________
**Browser:** __________________
**Device:** __________________

---

## Issues Found

Document any issues below:

| Issue | Severity | Steps to Reproduce | Status |
|-------|----------|-------------------|--------|
| | | | |
| | | | |
| | | | |

---

## Notes

Add any additional notes or observations:

_________________________________________________________

_________________________________________________________

_________________________________________________________

---

*This testing guide covers all 8 components and major features of the integrated app.*
