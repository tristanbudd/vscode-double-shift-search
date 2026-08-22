<div align="center">
    <!-- <img width="600" height="300" alt="Double Shift Search Banner" src="PLACEHOLDER" /> -->
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

- **Double Shift Trigger**: Quickly hit `Shift` twice in rapid succession to trigger the configured action.
- **Customizable Action**: Configure exactly what opens when you trigger the double shift. Choose from Quick Text Search, Find in Files, Quick Open (Go to File), Command Palette, or Go to Symbol.
- **Native Integration**: Seamlessly hooks into VS Code's native commands without lag.

### Configuration Options

You can adjust what the double shift triggers by setting `doubleShiftSearch.targetCommand` in your VS Code settings. Available options include:

- `workbench.action.quickOpen` (Default): Opens the quick file picker (Go to File) to jump to any file.
- `workbench.action.quickTextSearch`: Opens the global quick search to find text across all files in your workspace.
- `workbench.action.findInFiles`: Opens the search view in the sidebar to search text across your workspace.
- `workbench.action.showCommands`: Opens the Command Palette to execute any VS Code command.
- `workbench.action.gotoSymbol`: Opens the symbol picker to navigate to classes, methods, or variables in the active editor.

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
