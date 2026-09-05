# Change Log

All notable changes to the "double-shift-search" extension will be documented in this file.

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
