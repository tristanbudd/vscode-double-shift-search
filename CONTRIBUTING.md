# Contributing to VS Code Double Shift Search

First off, thanks for taking the time to contribute! Whether you are fixing a bug in the search engine or improving the extension options, I appreciate the help.

## Development Environment Setup

Double Shift Search is a VS Code extension. You will need Node.js 18+ installed.

1. **Fork and Clone** the repository:
   ```bash
   git clone https://github.com/tristanbudd/vscode-double-shift-search.git
   cd vscode-double-shift-search
   ```

2. **Setup:**
   ```bash
   npm install
   ```

3. **Start Development Server:**
   ```bash
   npm run watch
   ```
   *You can also press `F5` in VS Code to launch the Extension Development Host.*

## Workflow

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-descriptive-feature-name
   ```

2. **Make Your Changes:**
    - Keep extension logic in `src/`.
    - Follow existing patterns (TypeScript for logic, VS Code API for integration).

3. **Run Local Checks:**
   Before committing, ensure everything is green. Note that we use **Husky** and **lint-staged**, so `eslint --fix` will run automatically when you commit!

   ```bash
   # Check Types & Build Extension (uses esbuild)
   npm run compile

   # Check Linting & Formatting manually
   npm run lint

   # Run Tests
   npm run test
   ```

4. **Commit Your Changes:**
   Write clear and descriptive commit messages.
   ```bash
   git add .
   git commit -m "Feat/Title of your feature"
   ```

5. **Open a Pull Request:**
   Target the `master` branch. Provide a clear description of the changes using the provided PR template and link any relevant issues.

## Guidelines & Best Practices

### Extension (TypeScript)

- **Use the VS Code API:** Do not hardcode commands if there's an API for it.
- **Formatting:** ESLint is enforced. Ensure "Format on Save" is enabled in your IDE.
- **Contributions:** Ensure any new commands or settings are added to the `package.json` contributes section.

## Code of Conduct

This project follows my [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Please be respectful and constructive in all communications.


