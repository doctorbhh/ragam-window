# RAGAM

RAGAM is a modern, feature-rich desktop music streaming application built using **Electron**, **React**, and **TypeScript**. It offers a premium listening experience with features like seamless audio playback, offline support, synchronized lyrics, and multiple UI themes.

## ✨ Features

- **Beautiful User Interface**: Sleek, modern design built with React, Tailwind CSS, and Radix UI components.
- **Multiple Themes**: Customize your experience with distinct UI themes including KDON, MelloStudio, and Cyberpunk (with light and dark modes).
- **Advanced Media Playback**: Reliable, high-quality audio streaming powered by custom proxies, `yt-dlp-exec`, and efficient caching mechanisms.
- **Offline Playback**: Save your playlists and tracks to your local library for listening without an internet connection.
- **Synchronized Lyrics**: Follow along with track lyrics featuring a swipe-up interface directly in the player.
- **Cross-Platform**: Fully packaged and supported on Windows, macOS, and Linux.

## 🚀 Tech Stack

- **Core**: [Electron](https://www.electronjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Electron-Vite](https://electron-vite.org/)
- **Styling UI**: [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Lucide React](https://lucide.dev/)
- **State & Data**: [TanStack Query](https://tanstack.com/query/latest), React Router DOM, React Hook Form
- **Audio/Video**: `yt-dlp-exec`, `hls.js`

## 🛠️ Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation

```bash
# Install dependencies
npm install
```

### Development

To start the development server with hot-reload:

```bash
npm run dev
```

### Building for Production

To package the application for your operating system:

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## 📜 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build the app and package it
- `npm run lint` - Run ESLint checks
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking
