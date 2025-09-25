#!/usr/bin/env bash
set -euo pipefail

# Setup script for git hooks
echo "Setting up git hooks..."

# Install husky
npm install --save-dev husky

# Initialize husky
npx husky init

# Create pre-commit hook that mirrors repository policy
cat > .husky/pre-commit <<'EOF'
#!/usr/bin/env sh
set -e

npx --no-install lint-staged

npm run validate
EOF

chmod +x .husky/pre-commit

# Create pre-push hook for full project checks
cat > .husky/pre-push <<'EOF'
#!/usr/bin/env sh
set -e

npm run check:prepush
EOF

chmod +x .husky/pre-push

echo "✅ Git hooks setup complete!"
echo "Pre-commit runs lint-staged + validate; pre-push runs npm run check:prepush."
