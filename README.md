# FWB Dating App Monorepo

[![Test and Lint](https://github.com/<OWNER>/<REPO>/actions/workflows/test-and-lint.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/test-and-lint.yml)
[![Deploy to Hugging Face Space](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy-space.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy-space.yml)

> **Note:** Please replace `<OWNER>/<REPO>` in the badge URLs with your GitHub repository's owner and name.

This repository contains the source code for a FWB (Friends with Benefits) dating web application, built as a monorepo.

**Warning:** This project is currently in a non-functional state. Due to limitations in the execution environment, project dependencies could not be installed. Therefore, the application cannot be built, run, or tested. The CI/CD pipelines are configured but will fail.

## Workspaces

This monorepo is structured using npm workspaces:

- `apps/web`: The main Next.js web application.
- `packages/ui`: Shared React components.
- `packages/lib`: Shared libraries and utilities (e.g., Firebase client, DB helpers).
- `functions`: Firebase Cloud Functions for backend logic.
- `infra`: Infrastructure as Code (e.g., Dockerfile).

## Development

To get started, run the following commands from the root directory:

- `npm install`: Installs all dependencies for all workspaces. (Note: This command is currently blocked by environment limitations).
- `npm run dev`: Starts the Next.js development server for the `apps/web` application.
- `npm run build`: Builds all workspaces.
- `npm run lint`: Lints all workspaces.
