# Git Hooks

This project uses Git hooks to automatically run tests before committing code, preventing broken commits from being merged.

## Setup

The pre-commit hooks are configured in `.husky/` and will be automatically installed when you clone the repository.

### Install Hooks

To manually set up hooks:

```bash
# Full testing (unit + E2E) - ~1-2 minutes per commit
npm run setup-hooks

# Fast testing (unit tests only) - ~10-30 seconds per commit
npm run setup-hooks:fast
```

## Available Hooks

### `.husky/pre-commit`
**Default hook** - Runs both unit and E2E tests before allowing a commit.

```bash
npm run test:unit && npm run test:e2e
```

**Use when:** Making critical changes, before pushing to main branch, during refactoring.

**Time:** ~1-2 minutes

### `.husky/pre-commit-fast`
**Alternative hook** - Runs only unit tests (much faster).

```bash
npm run test:unit
```

**Use when:** Making small fixes, iterating quickly, committing to feature branches.

**Time:** ~10-30 seconds

## Switching Between Hooks

```bash
# Use full testing
npm run setup-hooks

# Use fast testing
npm run setup-hooks:fast
```

## Skipping Hooks

To commit without running tests (use carefully):

```bash
git commit --no-verify
```

## Test Scripts

Run tests directly without committing:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run unit tests with coverage
npm run test:unit:coverage

# Run only E2E tests
npm run test:e2e

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Run E2E tests in debug mode
npm run test:e2e:debug

# Quick test with minimal output
npm run test:quick
```

## Configuration Files

- `.husky/pre-commit` - Full test hook
- `.husky/pre-commit-fast` - Fast test hook
- `.husky/_/husky.sh` - Husky initialization script
- `scripts/setup-hooks.sh` - Hook installation script
- `vitest.config.js` - Unit test configuration
- `playwright.config.js` - E2E test configuration

## GitHub Actions (Future)

Consider also setting up GitHub Actions to run tests on pull requests:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:e2e
```
