# Change Log

All notable changes to the "double-shift-search" extension will be documented in this file.

## [2.0.1]

### Bug Fixes
- Fixed an issue where closing and reopening the search palette repeatedly could cause heavy search operations to run concurrently and lag the extension.

## [2.0.0]

### Features & Enhancements
- Double Shift Search now natively respects your workspace `files.exclude` and `search.exclude` settings, as well as `.gitignore`.
- Add a new `doubleShiftSearch.excludeFolders` setting for additional custom folder exclusions.
- Expand default list of `doubleShiftSearch.excludeExtensions` to cover common compiled outputs like `.pdb`, `.so`, `.class`, etc.
- Add intelligent binary sniffing before deep searching file contents to prevent garbled matches from unknown binary formats.
- Resolves #1


## [1.4.1]

### Enhancements
- Update project icon

## [1.4.0]

### Features & Enhancements
- Add persistent history tracking for recently opened files
- Add doubleShiftSearch.maxRecentFiles configuration setting to limit history

## [1.3.2]

### Bug Fixes
- Fixed the file watcher triggering a full cache refresh for changes inside node_modules, .git, and other ignored folders.
- Fixed the search palette leaking its disposable and getting stuck busy if closed before the initial file scan finished.
- Fixed the search spinner staying stuck after clearing the query while a symbol or text search was still in flight.
- Fixed directory indexing missing folders on Windows due to a case sensitive path comparison.
- Fixed newly added workspace folders not appearing in search results until a file inside them changed.
- Fixed default directory results not consistently showing top-level folders first.
- Fixed long file matches being cut off from the search result preview.

## [1.3.1]

### Enhancements
- Update README.

## [1.3.0]

### Features & Enhancements
- Add CamelHump/acronym search matching (e.g. `gua` matches `getUserAccount.ts`)
- Rank search results by match quality within existing priority groups (active/open editors, staged files, deprioritized folders)

## [1.2.0]

### Features & Enhancements
- Prioritize staged Git files in search results
- Deprioritize vendor and library folders (e.g. vendor, Pods, node_modules) with configurable folder list

## [1.1.0]

### Features & Enhancements
- Implement directory searching with trailing slash priority
- Prioritize functions and classes in search results
- Optimize symbol rendering and add loading UX

## [1.0.4]

### Enhancements
- Smart Active File Prioritization: The search algorithm now prioritizes your currently active file and open tabs, ensuring results you are most likely looking for appear instantly at the top.
- In-Memory Search Optimization: Open files are now searched directly from VS Code's active memory instead of the disk, resulting in massively faster text search performance for your active workspace.

## [1.0.3]

### Enhancements
- Memory Optimization: Significantly optimized memory usage when searching through large amounts of workspace files.

### Bug Fixes and Security
- Security: Fixed an RCE vulnerability by forcing a secure version of serialize-javascript.
- Testing: Expanded internal test coverage.

## [1.0.2]

### Features
- Selection Pre-fill: Added a new configuration option to automatically pre-fill the search query with your current text selection (doubleShiftSearch.useSelectionAsQuery).
- Ignored Extensions: Added a new configuration option to specify custom file extensions that should be ignored during searches (doubleShiftSearch.excludeExtensions).

## [1.0.1]

### Enhancements
- Search UI Refinement: Finalized the unified search flow UI and heavily optimized the file extension filters for better performance.
- Bundling: Set up esbuild for faster extension bundling and smaller bundle sizes.

### Documentation and Assets
- Updated extension logo and updated README with details on the new unified search features.
- Updated default branch references in CONTRIBUTING.md.

## [1.0.0]

Initial release.
