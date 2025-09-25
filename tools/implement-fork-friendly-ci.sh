#!/bin/bash

# Fork-Friendly CI/CD Implementation Script
# Usage: ./implement-fork-friendly-ci.sh
# 
# This script automates the implementation of fork-friendly CI/CD
# by adding fork detection conditions to all GitHub Actions workflows

set -e

echo "🚀 Implementing Fork-Friendly CI/CD..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if .github/workflows directory exists
if [ ! -d ".github/workflows" ]; then
    echo -e "${RED}✗${NC} No .github/workflows directory found"
    echo "This script must be run from the repository root"
    exit 1
fi

# 2. Backup existing workflows
echo "📦 Backing up workflows..."
backup_dir=".github/workflows.backup.$(date +%Y%m%d_%H%M%S)"
cp -r .github/workflows "$backup_dir"
echo -e "${GREEN}✓${NC} Workflows backed up to $backup_dir"

# 3. Count workflow files and jobs
WORKFLOW_COUNT=$(ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | wc -l)
echo "📊 Found ${WORKFLOW_COUNT} workflow files"

# 4. Process each workflow file
UPDATED_FILES=0
MANUAL_REVIEW_NEEDED=0

for file in .github/workflows/*.yml .github/workflows/*.yaml; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo -n "Processing ${filename}... "
        
        # Create temporary file
        temp_file="${file}.tmp"
        
        # Process the file with awk
        if awk '
        BEGIN {
            in_jobs = 0
            job_count = 0
            modified = 0
            manual_review = 0
        }

        /^jobs:/ {
            in_jobs = 1
            print
            next
        }

        # Match job definitions (2 spaces + name + colon)
        in_jobs && /^  [A-Za-z_][A-Za-z0-9_-]*:/ {
            job_name = $0
            print job_name
            job_count++

            # Look ahead for existing conditions
            getline next_line

            # Check if next line is already an if condition
            if (next_line ~ /^    if:/) {
                existing_condition = next_line
                sub(/^    if: /, "", existing_condition)
                if (existing_condition ~ /github\.event_name != '\''pull_request'\'' \|\| github\.event\.pull_request\.head\.repo\.fork != true \|\| vars\.ENABLE_CI_IN_FORK == '\''true'\''/) {
                    print next_line
                } else {
                    print next_line
                    manual_review = 1
                }
            } else if (next_line ~ /^    runs-on:/) {
                # No condition exists, add before runs-on
                print "    if: github.event_name != '\''pull_request'\'' || github.event.pull_request.head.repo.fork != true || vars.ENABLE_CI_IN_FORK == '\''true'\''"
                print next_line
                modified++
            } else {
                # Some other configuration, preserve as-is
                print next_line
            }
            next
        }
        
        # Reset when leaving jobs section
        /^[a-z]/ && in_jobs {
            in_jobs = 0
        }
        
        # Print all other lines
        { 
            if (!in_jobs) print 
        }
        
        END {
            if (modified > 0) {
                exit 0
            }
            if (manual_review > 0) {
                exit 2
            }
            exit 1
        }
        ' "$file" > "$temp_file"; then
            status=0
        else
            status=$?
        fi

        if [ $status -eq 0 ]; then
            mv "$temp_file" "$file"
            echo -e "${GREEN}✓${NC} Updated"
            ((UPDATED_FILES+=1))
        else
            rm -f "$temp_file"
            if [ $status -eq 2 ]; then
                echo -e "${YELLOW}○${NC} Existing conditions detected - manual review required"
                ((MANUAL_REVIEW_NEEDED+=1))
            else
                echo -e "${YELLOW}○${NC} No changes needed"
            fi
        fi

        # Check for complex conditions that might need manual review
        if grep -Eq "needs:|strategy:" "$file"; then
            echo "  ⚠️  Complex workflow detected - manual review recommended"
            ((MANUAL_REVIEW_NEEDED+=1))
        fi
    fi
done

echo -e "${GREEN}✓${NC} Updated ${UPDATED_FILES} workflow files"

# 5. Create Fork Guide if it doesn't exist
if [ ! -f ".github/FORK_GUIDE.md" ]; then
    echo "📝 Creating Fork Guide documentation..."
    cat > .github/FORK_GUIDE.md << 'EOF'
# Fork Guide - CI/CD Configuration

## CI/CD in Forks

By default, CI/CD workflows are **disabled in forks** to conserve GitHub Actions resources.

### Enabling CI/CD in Your Fork

If you need to run CI/CD workflows in your fork:

1. Navigate to **Settings** → **Secrets and variables** → **Actions** → **Variables**
2. Click **New repository variable**
3. Create variable:
   - **Name**: `ENABLE_CI_IN_FORK`
   - **Value**: `true`
4. Click **Add variable**

### Disabling CI/CD Again

Either:
- Delete the `ENABLE_CI_IN_FORK` variable, or
- Set its value to `false`

### Alternative Testing Options

- **Local testing**: Run tests locally before pushing
- **Pull Request CI**: Workflows automatically run when you open a PR
- **GitHub Codespaces**: Full development environment
EOF
    echo -e "${GREEN}✓${NC} Fork Guide created"
else
    echo "ℹ️  Fork Guide already exists"
fi

# 6. Validate YAML files (if yamllint is available)
if command -v yamllint &> /dev/null; then
    echo "🔍 Validating YAML syntax..."
    VALIDATION_ERRORS=0
    for file in .github/workflows/*.yml .github/workflows/*.yaml; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            if yamllint -d relaxed "$file" &>/dev/null; then
                echo -e "  ${GREEN}✓${NC} ${filename}"
            else
                echo -e "  ${RED}✗${NC} ${filename} - YAML validation failed"
                ((VALIDATION_ERRORS++))
            fi
        fi
    done
    
    if [ $VALIDATION_ERRORS -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC}  ${VALIDATION_ERRORS} files have YAML errors"
    fi
else
    echo "ℹ️  yamllint not found - skipping YAML validation"
    echo "  Install with: pip install yamllint"
fi

# 7. Summary
echo ""
echo "═══════════════════════════════════════"
echo "       Fork-Friendly CI/CD Summary"
echo "═══════════════════════════════════════"
echo "  📁 Files updated: ${UPDATED_FILES}"
echo "  📊 Total workflows: ${WORKFLOW_COUNT}"
echo "  📝 Fork Guide: .github/FORK_GUIDE.md"
if [ $MANUAL_REVIEW_NEEDED -gt 0 ]; then
    echo "  ⚠️  Files needing review: ${MANUAL_REVIEW_NEEDED}"
fi
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Test workflows locally (if possible)"
echo "3. Commit changes: git commit -m 'feat: implement fork-friendly CI/CD'"
echo "4. Push and create PR"
echo ""
echo "Remember to update README.md with fork information!"
echo "═══════════════════════════════════════"

# Exit with appropriate code
exit 0