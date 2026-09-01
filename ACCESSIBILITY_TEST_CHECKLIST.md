# Accessibility Testing Checklist

This document outlines manual testing procedures for verifying WCAG AA accessibility compliance in the Tagg mobile app.

## Screen Reader Testing

### Android (TalkBack)

**Enable TalkBack:**
1. Settings → Accessibility → TalkBack
2. Toggle TalkBack on
3. Grant required permissions

**Test Dashboard Screen:**
- [ ] Navigate to dashboard using explore-by-touch (swiping left/right)
- [ ] Verify notification button is announced as "View notifications, button"
- [ ] Verify profile button is announced as "View profile, button"
- [ ] Verify menu button is announced as "Open menu, button"
- [ ] Verify search bar is announced as "Search transactions"
- [ ] Verify each filter button (All, Credit, Debit) is announced with its selected state
- [ ] Verify balance card is read as a single unit: "Balance: X,XXX TOKEN"
- [ ] Verify transaction items include full context (reference, amount, status, date)
- [ ] Verify filter chips are announced with removal action: "Status: completed, double-tap to remove"
- [ ] Verify "Clear all" button is announced correctly

**Test Transaction Detail Screen:**
- [ ] Verify transaction ID is announced
- [ ] Verify amount and token are announced together
- [ ] Verify sender and receiver tags are clearly identified
- [ ] Verify transaction date and status are announced
- [ ] Verify action buttons (Share, Download) have descriptive labels
- [ ] Verify all text content is readable without visual context

### iOS (VoiceOver)

**Enable VoiceOver:**
1. Settings → Accessibility → VoiceOver
2. Toggle VoiceOver on
3. Use two-finger Z-swipe to enable/disable

**Test Dashboard Screen:**
- [ ] Use swipe-left to navigate forward through elements
- [ ] Use swipe-right to navigate backward through elements
- [ ] Verify notification button: double-tap to activate
- [ ] Verify profile button: double-tap to activate
- [ ] Verify menu button: double-tap to activate
- [ ] Verify search field: single-tap to focus, use keyboard
- [ ] Verify filter buttons announce their state
- [ ] Verify balance cards are read as coherent units
- [ ] Verify transaction list items are properly announced
- [ ] Verify filter operations work with VoiceOver enabled

**Test Transaction Detail Screen:**
- [ ] Verify all transaction details are accessible
- [ ] Verify buttons and actions are properly labeled
- [ ] Test sharing functionality with VoiceOver
- [ ] Test navigation back to list

## Color Contrast Testing

**Tools Required:**
- WCAG Contrast Checker (browser extension or desktop app)
- Screenshots of each screen

**Test Cases:**

### Dark Theme (Primary Color Scheme)
- [ ] **Text on Background**
  - Light text (#E2E2E2) on dark background (#090715): Target ≥ 4.5:1 (Pass: ~13:1)
  - Subtext (#867EA5) on dark background (#090715): Target ≥ 4.5:1 (Verify)
  
- [ ] **Accent Colors**
  - Primary purple (#9600FF) on dark background (#090715): Target ≥ 3:1 for large text
  - Accent purple (#674AA6) on dark surfaces (#130F22): Target ≥ 3:1
  - Success green (#43A047) on background: Target ≥ 4.5:1
  - Error red (#E53935) on background: Target ≥ 4.5:1

- [ ] **Interactive Elements**
  - Button text on button backgrounds: Verify 4.5:1+ ratio
  - Link text vs. body text: Ensure color differentiation
  - Selected vs. unselected state: Sufficient contrast

### Light Theme (if applicable)
- [ ] Follow same tests with light theme colors
- [ ] Verify inverted contrast ratios meet standards

## Tap Target Size Testing

**Procedure:**
1. Use Android Device Developer Options → Pointer Location (shows touch area)
2. Or use iOS Settings → Display & Brightness → Display Zoom insights

**Test Cases:**
- [ ] **Header Buttons** (Notification, Profile, Menu):
  - Visual size: 48×48 dp ✓
  - Touch target: 48×48 dp ✓
  - Spacing between buttons: ≥ 8 dp ✓

- [ ] **Filter Buttons** (All, Credit, Debit):
  - Visual height: 41 dp
  - Touch padding: 12 dp vertical, 16 dp horizontal
  - Total touch target: ≥ 48×48 dp ✓

- [ ] **Filter Chips**:
  - Minimum tap area: 44 dp height ✓
  - Horizontal padding: ≥ 10 dp ✓
  - Touch area accessible without edge collision

- [ ] **Action Buttons** (Search clear, filter open):
  - Minimum 44×44 dp tap target
  - 8-12 dp spacing from adjacent elements

- [ ] **Transaction List Items**:
  - Full row is tappable (≥ 56 dp height) ✓
  - No small hit targets required for interaction

## Semantic Structure Testing

**Procedure:** Enable screen reader and verify semantic tree

**Test Cases:**

### Dashboard
- [ ] Page structure announced correctly
- [ ] Headings use proper semantic levels (h1, h2, etc.)
- [ ] Icon-only buttons have labels
- [ ] Form fields (search) are labeled
- [ ] Filter state is communicated
- [ ] Dynamic content updates are announced

### Transaction List
- [ ] Each transaction is a distinct, focusable unit
- [ ] List structure is clear (implied by navigation)
- [ ] Pagination/load-more is announced
- [ ] Filter results count is announced to screen reader users

### Cards & Complex Widgets
- [ ] Balance card components are merged into single announcement
- [ ] Multi-line content reads naturally
- [ ] Action buttons within cards are accessible

## Keyboard Navigation Testing

**Procedure:**
1. Disable touch input
2. Use Android keyboard navigation or iOS Keyboard Accessibility
3. Use Tab and Shift+Tab to navigate

**Test Cases:**
- [ ] All interactive elements are reachable via keyboard
- [ ] Tab order is logical (left-to-right, top-to-bottom)
- [ ] Focus indicator is visible on all elements
- [ ] No keyboard traps (user can always move forward/backward)
- [ ] Enter/Space activates buttons correctly
- [ ] Escape closes modal dialogs

## Focus & Visual Feedback

**Procedure:** Verify focus states during keyboard/screen reader navigation

**Test Cases:**
- [ ] Focus indicator has sufficient contrast (≥ 3:1)
- [ ] Focus indicator has ≥ 3 dp border or outline
- [ ] Focus state is not only indicated by color
- [ ] Focus indicator is not obscured by other elements
- [ ] Focused element's context is clear

## Dynamic Content & State Changes

**Procedure:** Verify announcements when content updates

**Test Cases:**
- [ ] Filter application announces filter state change
- [ ] Transaction list updates are announced when filters applied
- [ ] "Clear all" button becomes unavailable (announced) when no filters active
- [ ] Sort/pagination changes are announced
- [ ] Loading states are communicated to screen readers
- [ ] Error messages are announced immediately

## Tested Screens

- [ ] Dashboard / Home screen
  - Notifications
  - Profile access
  - Menu navigation
  - Balance display
  - Transaction list
  - Filter functionality

- [ ] Transaction Detail screen
  - Full transaction info
  - Action buttons (share, download)
  - Receipt handling
  - Back navigation

- [ ] Filter Bottom Sheet
  - Status filter options
  - Type filter options
  - Date range picker
  - Token/chain filters
  - Done/close button

## Test Environment

**Android:**
- Device: ________________
- OS Version: ________________
- TalkBack Version: ________________
- Chrome Version (if testing web): ________________

**iOS:**
- Device: ________________
- OS Version: ________________
- VoiceOver: ________________

## Results Summary

**Date Tested:** ________________
**Tester Name:** ________________
**Overall Pass/Fail:** ________________

**Issues Found:**
1. ___________________________________________________________________________
2. ___________________________________________________________________________
3. ___________________________________________________________________________

**Notes:**
___________________________________________________________________________
___________________________________________________________________________

---

## WCAG 2.1 AA Compliance Checklist

- [ ] **1.4.3 Contrast (Minimum):** Text and UI components have ≥ 4.5:1 contrast ratio (Level AA)
- [ ] **2.1.1 Keyboard:** All functionality available via keyboard
- [ ] **2.1.2 No Keyboard Trap:** Keyboard focus can move away from any component
- [ ] **2.4.3 Focus Order:** Tab order is logical
- [ ] **2.4.7 Focus Visible:** Focus indicator is visible
- [ ] **2.5.5 Target Size:** Touch targets are ≥ 44×44 dp (Android) / 44pt (iOS)
- [ ] **3.2.4 Consistent Identification:** Buttons and controls with same function use same labels
- [ ] **4.1.2 Name, Role, Value:** All components have accessible name, role, and state

---

## Post-Testing Checklist

- [ ] All issues documented with severity level (Critical/Major/Minor)
- [ ] Screenshots or video recordings taken for defects
- [ ] Fixes implemented for failing test cases
- [ ] Re-testing performed after fixes
- [ ] Sign-off obtained from accessibility lead
