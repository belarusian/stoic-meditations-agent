# Client Build Orchestration & Asset Distribution

## Overview

The client build system is responsible for transforming TypeScript source code into optimized, distributable web assets. This process involves running tests, bundling logic with `esbuild`, injecting dependencies into an HTML entry point, and distributing the final artifacts to a root-level directory for serving.

## Core Functionality

### 1. Build Orchestration (`client/build.mjs:chunk_0`)

The initial phase of the build process focuses on validation and bundling:

- **Test Execution**: Runs Vitest tests to ensure code integrity before proceeding with the build.
- **Bundling**: Uses `esbuild` to compile TypeScript source files into a single, minified JavaScript module. This reduces file size and improves load times.
- **HTML Preparation**: Generates an HTML entry point that imports the bundled JavaScript logic along with any required external SDK dependencies.

### 2. Asset Finalization & Distribution (`client/build.mjs:chunk_4`)

The final phase ensures the built assets are correctly structured and ready for deployment:

- **Script Injection**: Injects the generated script reference into the HTML template, ensuring the browser loads the correct bundled code.
- **Output Writing**: Writes the finalized HTML and JavaScript files to a designated distribution directory.
- **Asset Copying**: Copies all generated assets from the build output directory to a root-level `dist` folder. This step prepares the assets for static file serving or deployment pipelines.

## Workflow Integration

These components work together in a sequential pipeline:

1. **Validation & Bundling** (`chunk_0`): Ensures code quality and creates optimized bundles.
2. **Assembly & Distribution** (`chunk_4`): Assembles the final HTML structure and moves assets to their final destination for serving.

This two-stage approach separates concerns between code transformation (testing/bundling) and deployment preparation (HTML injection/distribution), ensuring a clean and maintainable build process.

## Code References

- **Build Orchestration**: `client/build.mjs:chunk_0` (lines 1-50)
- **Asset Distribution**: `client/build.mjs:chunk_4` (lines 201-219)

## Implementation References

- `client/build.mjs:chunk_0` (lines 1-50)
- `client/build.mjs:chunk_4` (lines 201-219)
