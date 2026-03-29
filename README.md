# Novel DR

A mobile app for downloading and reading web novels offline. Supports limited novel sites.

## Features

- **Download novels** from ReadNovelFull, NovelFull, and FreeWebNovel
- **Offline reading** — all chapter content is stored locally on your device
- **Reading progress tracking** — resume exactly where you left off
- **Chapter updates** — fetch new chapters for novels already in your library
- **Three themes** — Dark, Light, and Sepia
- **Adjustable reader** — font size and line spacing controls
- **Library management** — long-press any novel to remove it

## Screens

| Screen | Description |
|---|---|
| Library | View all downloaded novels, tap to open, long-press to delete |
| Download | Paste a novel URL and download chapters with a live progress log |
| Updates | Select a novel and fetch new chapters from where you left off |
| Settings | Switch themes, view library stats |
| Novel Detail | Cover, synopsis, chapter list, reading progress |
| Reader | Full-screen reading with font/spacing controls and prev/next navigation |

## Supported Sites

- [ReadNovelFull](https://readnovelfull.com)
- [NovelFull](https://novelfull.net)
- [FreeWebNovel](https://freewebnovel.com)
- 

## Building the APK

1. Fork or clone this repo
2. Add your `EXPO_TOKEN` as a GitHub Actions secret (get it from [expo.dev](https://expo.dev) → Account Settings → Access Tokens)
3. Go to **Actions** → **Build Android APK** → **Run workflow**
4. Download the APK from the **Artifacts** section when the build finishes

## Tech Stack

- **React Native / Expo** — mobile app
- **Expo Router** — file-based navigation
- **AsyncStorage** — local offline storage
- **Express + node-html-parser** — backend scraping API
- **React Native Reanimated** — animations
- **pnpm workspaces** — monorepo
