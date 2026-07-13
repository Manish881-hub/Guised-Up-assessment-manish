# Post Compose — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a modal compose screen so users can create text posts from the mobile app.

**Architecture:** A `ComposeModal` component renders inside a React Native `<Modal>` sliding up from the feed. A FAB button on `FeedScreen` opens it. On publish, the feed resets to page 1 showing the new post. Auth token moves from hardcoded `App.tsx` to `expo-secure-store`.

**Tech Stack:** Expo SDK 54, React Native 0.81, `expo-secure-store`

---

### Task 1: Install expo-secure-store

**Files:**
- Modify: `mobile/package.json`

**Step 1: Install package**

Run:
```bash
cd C:\Users\manis\Desktop\gussedup\mobile
npx expo install expo-secure-store
```

**Step 2: Verify install**

Check that `expo-secure-store` appears in `package.json` dependencies.

---

### Task 2: Move auth token to SecureStore

**Files:**
- Modify: `mobile/App.tsx`

**Step 1: Rewrite App.tsx**

Replace the hardcoded `AUTH_TOKEN` with:
- Load token from `expo-secure-store` on mount using `useEffect` + `getItemAsync('auth_token')`
- Store the hardcoded token on first launch if none exists
- Show a loading spinner (`ActivityIndicator`) while token loads
- Pass `authToken` to `FeedScreen` only after loaded
- Use `expo-status-bar` with `style="auto"` (adapts to dark mode)

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output (success)

---

### Task 3: Create ComposeModal component

**Files:**
- Create: `mobile/src/screens/ComposeModal.tsx`

**Step 1: Write the component**

Props:
- `visible: boolean`
- `onDismiss: () => void`
- `onPublished: () => void`
- `authToken: string`

State:
- `body: string`
- `posting: boolean`
- `error: string | null`

UI:
- `<Modal animationType="slide" transparent={false}>`
- Header row: "New Post" `<Text>` (left) + X `<TouchableOpacity>` (right, dismisses)
- Multiline `<TextInput>` — auto-focused, placeholder "What's the fashion move?", max 2000 chars
- Character counter `{body.length}/2000` — color turns `#E4572E` when > 1800
- "Post" button — disabled when `body.trim()` is empty or `posting` is true; shows spinner when posting
- Error message in red below input when `error` is set

On Post press:
1. `setPosting(true)`
2. `POST /api/posts` with `{ body }`, `Authorization: Bearer <token>`
3. On 201: `onPublished()`
4. On error: `setError(e.message)`, `setPosting(false)`

---

### Task 4: Add FAB and modal state to FeedScreen

**Files:**
- Modify: `mobile/src/screens/FeedScreen.tsx`

**Step 1: Add FAB button**

- Positioned absolute: `bottom: 24, right: 24`
- Size: `width: 56, height: 56, borderRadius: 28`
- Background color: theme brand (`#E4572E`)
- White "+" text, fontSize 28, centered
- `shadowOpacity: 0.3` (drop shadow)
- `zIndex: 10` to stay above FlatList

**Step 2: Add modal state**

- `showComposer: boolean` state, default `false`
- FAB `onPress` → `setShowComposer(true)`
- Render `<ComposeModal>` when `showComposer` is true
- `onPublished`: `setShowComposer(false)` + `fetchFeed(1, false)` (reset feed)
- `onDismiss`: `setShowComposer(false)`

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

---

### Task 5: Final verification

**Step 1: Build check**

Run: `npx tsc --noEmit` from `mobile/`
Expected: no output

**Step 2: Commit all changes**

Stage and commit with message: `feat: post compose modal with SecureStore auth — text-only posts`
