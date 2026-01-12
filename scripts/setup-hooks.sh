#!/bin/sh
# Murajah Git Hooks Setup Script
# Usage: ./scripts/setup-hooks.sh [full|fast]

HOOK_TYPE=${1:-full}

if [ "$HOOK_TYPE" = "fast" ]; then
  echo "📝 Installing fast pre-commit hook (unit tests only)..."
  cp .husky/pre-commit-fast .git/hooks/pre-commit
  echo "✅ Fast pre-commit hook installed!"
  echo ""
  echo "This hook will run unit tests on commit."
  echo "To switch to full testing, run: npm run setup-hooks full"
else
  echo "📝 Installing full pre-commit hook (unit + E2E tests)..."
  cp .husky/pre-commit .git/hooks/pre-commit
  echo "✅ Full pre-commit hook installed!"
  echo ""
  echo "This hook will run both unit and E2E tests on commit."
  echo "⚠️  This may take 1-2 minutes per commit."
  echo "To switch to fast testing, run: npm run setup-hooks fast"
fi

chmod +x .git/hooks/pre-commit
git config core.hooksPath .husky

echo ""
echo "📚 To skip hooks for a commit, use: git commit --no-verify"
