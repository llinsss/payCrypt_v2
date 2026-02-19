# Tagged GitHub Bot

Automated bot for handling PRs, reviews, and merges in the Tagged repository.

## Features

### 🤖 Automated PR Validation
- Validates PR title follows conventional commits
- Ensures PR references an issue number
- Checks that backend files are modified
- Auto-labels PRs based on validation status

### ✅ Automated Testing
- Runs backend tests with PostgreSQL and Redis
- Executes linting checks
- Reports test results in PR comments
- Checks code coverage

### 🔍 Automated Code Review
- Scans for console.log statements
- Detects hardcoded credentials
- Checks for TODO comments
- Identifies missing error handling
- Posts review comments with suggestions

### 🚀 Auto-Merge
- Automatically merges PRs when:
  - All tests pass
  - Code review passes
  - At least 1 approval received
  - No changes requested
- Closes linked issues automatically
- Uses squash merge strategy

### 🏷️ Auto-Labeling
- **PR Size**: XS, S, M, L, XL based on lines changed
- **Validation**: validation-passed, validation-failed
- **Status**: ready-for-review, needs-changes
- **Issue Type**: bug, enhancement, security, performance
- **Priority**: critical, high-priority, medium-priority

### 🗑️ Stale Management
- Marks PRs stale after 14 days of inactivity
- Closes stale PRs after 7 additional days
- Marks issues stale after 30 days
- Exempts pinned, security, and critical issues

## Bot Commands

Use these commands in PR comments:

```
/bot help       - Show available commands
/bot retest     - Retrigger tests
/bot merge      - Force merge (requires approval)
/bot review     - Run code review again
```

## PR Requirements

### Title Format
Must follow conventional commits:
```
feat: add new feature
fix: resolve bug
docs: update documentation
style: format code
refactor: restructure code
perf: improve performance
test: add tests
chore: update dependencies
ci: update workflows
```

### Issue Reference
PR must reference an issue:
```
Fixes #123
Closes #45
Resolves #67
```

### File Changes
PR must modify files in `backend/` directory

## Workflow Triggers

### PR Automation (`pr-automation.yml`)
**Triggers:**
- PR opened, synchronized, reopened, edited
- PR review submitted
- Comment created on PR

**Jobs:**
1. **pr-validation** - Validates PR structure
2. **backend-tests** - Runs tests and linting
3. **code-review** - Automated code analysis
4. **auto-merge** - Merges if approved
5. **handle-commands** - Processes bot commands

### Issue Labeler (`issue-labeler.yml`)
**Triggers:**
- Issue opened or edited

**Actions:**
- Auto-labels based on content
- Welcomes first-time contributors

### PR Size Labeler (`pr-size-labeler.yml`)
**Triggers:**
- PR opened or synchronized

**Actions:**
- Calculates lines changed
- Adds size label
- Warns if PR is too large

### Stale Handler (`stale.yml`)
**Triggers:**
- Daily at midnight (cron)
- Manual workflow dispatch

**Actions:**
- Marks stale PRs and issues
- Closes after inactivity period

## Configuration

### Required Permissions
```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
  checks: write
```

### Environment Variables
Tests require:
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `REDIS_HOST`
- `REDIS_PORT`

### Services
- PostgreSQL 15
- Redis 7

## Merge Strategy

**Method:** Squash merge

**Commit Format:**
```
<PR Title> (#<PR Number>)

Auto-merged by Tagged Bot
```

## Labels Used

### Validation
- `validation-passed` - PR meets requirements
- `validation-failed` - PR needs fixes

### Status
- `ready-for-review` - Ready for human review
- `needs-changes` - Changes requested
- `has-warnings` - Non-blocking warnings
- `stale` - Inactive for extended period

### Size
- `size/XS` - < 50 lines
- `size/S` - 50-199 lines
- `size/M` - 200-499 lines
- `size/L` - 500-999 lines
- `size/XL` - 1000+ lines

### Type
- `bug` - Bug fix
- `enhancement` - New feature
- `security` - Security issue
- `performance` - Performance improvement
- `documentation` - Documentation update

### Priority
- `critical` - Must fix immediately
- `high-priority` - Important
- `medium-priority` - Normal priority
- `low-priority` - Nice to have

### Special
- `good-first-issue` - Good for newcomers
- `in-progress` - Work in progress
- `blocked` - Blocked by dependency
- `on-hold` - Temporarily paused

## Exemptions

### Stale Exemptions
PRs with these labels won't be marked stale:
- `in-progress`
- `blocked`
- `on-hold`

Issues with these labels won't be marked stale:
- `pinned`
- `security`
- `critical`

## Troubleshooting

### PR Not Auto-Merging
Check:
1. All tests passed?
2. Code review passed?
3. At least 1 approval?
4. No changes requested?
5. PR references an issue?

### Tests Failing
1. Check test logs in Actions tab
2. Ensure backend code compiles
3. Verify database migrations work
4. Use `/bot retest` to retry

### Bot Not Responding
1. Check workflow runs in Actions tab
2. Verify permissions are correct
3. Ensure workflows are enabled
4. Check for syntax errors in YAML

## Development

### Testing Workflows Locally
Use [act](https://github.com/nektos/act):
```bash
act pull_request -W .github/workflows/pr-automation.yml
```

### Modifying Workflows
1. Edit workflow files in `.github/workflows/`
2. Test changes in a fork first
3. Submit PR with workflow changes
4. Monitor first run carefully

## Support

For issues with the bot:
1. Check [Actions tab](../../actions) for logs
2. Open an issue with `bot` label
3. Tag maintainers if urgent

## Credits

Built with:
- [GitHub Actions](https://github.com/features/actions)
- [actions/github-script](https://github.com/actions/github-script)
- [actions/stale](https://github.com/actions/stale)
