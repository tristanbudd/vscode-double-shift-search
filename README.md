<div align="center">
    <img width="600" height="300" alt="Double Shift Search Banner" src="https://github.com/user-attachments/assets/bf67e5a5-3360-4046-9278-4f0fd5a6517e" />
</div>

# Double Shift Search (VS Code Extension)

![](https://img.shields.io/github/stars/tristanbudd/vscode-double-shift-search.svg)
![](https://img.shields.io/github/watchers/tristanbudd/vscode-double-shift-search.svg)
![](https://img.shields.io/github/license/tristanbudd/vscode-double-shift-search.svg)

![](https://img.shields.io/github/issues-raw/tristanbudd/vscode-double-shift-search.svg)
![](https://img.shields.io/github/issues-closed-raw/tristanbudd/vscode-double-shift-search.svg)
![](https://img.shields.io/github/issues-pr-raw/tristanbudd/vscode-double-shift-search.svg)
![](https://img.shields.io/github/issues-pr-closed-raw/tristanbudd/vscode-double-shift-search.svg)

A minimalist VS Code extension that brings the beloved JetBrains "Double Shift" (Search Everywhere) functionality to Visual Studio Code.

---

## Project Description

Double Shift Search allows you to quickly open the command palette, find files, or search across your workspace simply by double-tapping the `Shift` key. This seamless transition is perfect for developers moving from JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.) or those who want a lightning-fast keyboard shortcut for navigation.

---

## Features

- **Double Shift Trigger**: Hit `Shift` twice in rapid succession to instantly open the Search Everywhere palette.
- **Unified Custom Palette**: A bespoke interface that replicates the beloved JetBrains Search Everywhere experience, natively integrated into VS Code without any clunky UI switching.
- **Deep Content Search**: Searches the actual contents of your files instantly, smartly skipping heavy assets (archives, media, binaries) for maximum speed.
- **Workspace Symbols**: Automatically queries your workspace symbols so you can instantly jump straight to classes, methods, and functions.
- **Smart Multi-Term Fuzzy Matching**: Need something specific? Type multiple words (e.g., `folder config`) and it will intelligently match across your entire workspace.
- **Open Editors First**: Prioritizes your currently open files at the top of the list for lightning-fast context switching.

### Configuration

You can customize the behavior of Double Shift Search in your VS Code settings:
- `doubleShiftSearch.useSelectionAsQuery` (Default: `false`): Automatically pre-fills the search palette with the text you currently have selected in your active editor.
- `doubleShiftSearch.excludeExtensions` (Default: `['.zip', '.tar', '.png', ...] `): A list of file extensions to completely ignore when searching file contents.

---

## Tech Stack

- **Framework:** VS Code Extension API
- **Language:** TypeScript
- **Testing:** Mocha & VS Code Test Electron

---

## Installation & Setup

### 1. Install from the Marketplace

You can install the extension directly from the VS Code Extension Marketplace by searching for **Double Shift Search**.

### 2. Manual Setup (Development)

```bash
git clone https://github.com/tristanbudd/vscode-double-shift-search.git
cd vscode-double-shift-search
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host and test the extension.

---

## Scripts

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript files
npm run watch        # Watch and recompile on changes
npm run lint         # Run ESLint for code analysis
npm run test         # Run extension test suite
```

---

## Credits & Licence

This project is licensed under the **[MIT Licence](LICENSE)**.
