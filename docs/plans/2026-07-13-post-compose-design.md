# Post Compose — Design

## Overview

Add a modal compose screen to the mobile app so users can create text posts from their device. The new post feeds through the existing ranking pipeline (authenticity score, embedding, feed position).

## Components

### `ComposeModal` (new, `src/screens/ComposeModal.tsx`)

A React Native `<Modal animationType="slide">` containing:

| Element | Detail |
|---------|--------|
| Header | "New Post" title + X dismiss button |
| Text input | Multiline `TextInput`, auto-focus on open, max 2000 chars |
| Character counter | `{n}/2000`, turns red near limit |
| Post button | Disabled when `body.trim()` is empty; shows `ActivityIndicator` while posting |
| Error display | Inline red text below input on failure |

**State:**
- `body: string`
- `posting: boolean`
- `error: string | null`

**Flow:**
1. User taps FAB → modal opens with auto-focused input
2. Types post body
3. Taps "Post"
4. `POST /api/posts` with `{ body }` + `Authorization: Bearer <token>`
5. On 201: call `onPublished()` callback → parent dismisses modal + resets feed
6. On error: show error message, re-enable button

### `FeedScreen` changes

**Additions:**
- Floating Action Button (FAB): 56pt orange circle with "+", positioned `bottom: 24, right: 24`, above the FlatList
- State: `showComposer: boolean`
- When `showComposer` is true, render `ComposeModal` on top
- `onPublished`: dismiss modal + `fetchFeed(1, false)` to reload

**Expo packages to install:**
- `expo-secure-store` — persist auth token so it survives app restarts

### `App.tsx` changes

- Remove hardcoded `AUTH_TOKEN`
- Load token from `expo-secure-store` on mount
- Show loading spinner while token loads
- Pass `authToken` to `FeedScreen` as before

## No image upload

The backend `POST /api/posts` accepts `image_url` as a nullable URL string but does not handle file uploads. Image support deferred.

## No backend changes

`POST /api/posts` already accepts `body: string`, runs the authenticity heuristic, generates an embedding, and returns the post. No changes needed.

## Files changed

- `mobile/src/screens/ComposeModal.tsx` — **new**
- `mobile/src/screens/FeedScreen.tsx` — add FAB, modal state, `onPublished` handler
- `mobile/App.tsx` — load token from SecureStore
- `mobile/package.json` — add `expo-secure-store`
