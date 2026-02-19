# GitHub Bot Setup Guide

This guide explains how to set up and configure the Tagged GitHub bot.

## Quick Start

The bot is already configured and will automatically run when:
- PRs are opened/updated
- Issues are created
- Comments are posted
- Daily (for stale management)

## Files Created

```
.github/
├── workflows/
│   ├── pr-automation.yml      # Main PR automation
│   ├── issue-labeler.yml      # Auto-label issues
│   ├── pr-size-labeler.yml    # Label PR by size
│   └── stale.yml              # Handle stale PRs/issues
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml         # Bug report template
│   └── feature_request.yml    # Feature request template
├── PULL_REQUEST_TEMPLATE.md   # PR template
└── BOT_DOCUMENTATION.md       # Full bot docs
```

## Required Setup

### 1. Enable GitHub Actions
1. Go to repository Settings
2. Click "Actions" → "General"
3. Enable "Allow all actions and reusable workflows"
4. Save

### 2. Configure Branch Protection (Optional but Recommended)
1. Go to Settings → Branches
2. Add rule for `main` branch:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass
   - ✅ Require branches to be up to date
   - Select: `backend-tests`, `code-review`

### 3. Create Labels
Run this script to create all required labels:

```bash
# Install GitHub CLI if needed
brew install gh

# Authenticate
gh auth login

# Create labels
gh label create "validation-passed" --color "0E8A16" --description "PR validation passed"
gh label create "validation-failed" --color "D93F0B" --description "PR validation failed"
gh label create "ready-for-review" --color "0E8A16" --description "Ready for human review"
gh label create "needs-changes" --color "D93F0B" --description "Changes requested"
gh label create "has-warnings" --color "FBCA04" --description "Non-blocking warnings"
gh label create "size/XS" --color "3CBF00" --description "< 50 lines"
gh label create "size/S" --color "5D9801" --description "50-199 lines"
gh label create "size/M" --color "7F7203" --description "200-499 lines"
gh label create "size/L" --color "A14C05" --description "500-999 lines"
gh label create "size/XL" --color "C32607" --description "1000+ lines"
gh label create "stale" --color "EEEEEE" --description "Inactive"
gh label create "backend" --color "1D76DB" --description "Backend related"
gh label create "critical" --color "B60205" --description "Critical priority"
gh label create "high-priority" --color "D93F0B" --description "High priority"
gh label create "medium-priority" --color "FBCA04" --description "Medium priority"
gh label create "low-priority" --color "0E8A16" --description "Low priority"
gh label create "good-first-issue" --color "7057FF" --description "Good for newcomers"
gh label create "in-progress" --color "1D76DB" --description "Work in progress"
gh label create "blocked" --color "D93F0B" --description "Blocked"
gh label create "on-hold" --color "FBCA04" --description "On hold"
```

## Bot Capabilities

### ✅ What the Bot Does Automatically

1. **PR Validation**
   - Checks title format (conventional commits)
   - Verifies issue reference
   - Ensures backend files modified

2. **Testing**
   - Runs backend tests
   - Executes linting
   - Reports results

3. **Code Review**
   - Scans for console.log
   - Detects hardcoded secrets
   - Checks error handling

4. **Auto-Merge**
   - Merges when approved + tests pass
   - Closes linked issues
   - Uses squash merge

5. **Labeling**
   - Adds size labels
   - Adds status labels
   - Adds type labels

6. **Stale Management**
   - Marks inactive PRs/issues
   - Closes after grace period

### 🚫 What the Bot Doesn't Do

- Deploy to production
- Manage secrets
- Create releases
- Send external notifications
- Modify code directly

## Testing the Bot

### Test PR Validation
1. Create a PR without issue reference
2. Bot should comment with validation errors
3. Add `Fixes #123` to description
4. Bot should add `validation-passed` label

### Test Auto-Merge
1. Create a valid PR
2. Wait for tests to pass
3. Approve the PR
4. Bot should auto-merge within 1 minute

### Test Bot Commands
Comment on a PR:
```
/bot help
```
Bot should respond with available commands.

## Troubleshooting

### Bot Not Running
**Check:**
- Actions are enabled in Settings
- Workflow files have no syntax errors
- Repository has required permissions

**Fix:**
```bash
# Validate workflow syntax
gh workflow list
gh workflow view pr-automation.yml
```

### Tests Failing
**Check:**
- Backend code compiles
- Dependencies installed
- Database migrations work

**Fix:**
```bash
cd backend
npm install
npm test
```

### Auto-Merge Not Working
**Check:**
- PR has 1+ approval
- All checks passed
- No changes requested
- PR references an issue

**Debug:**
1. Go to Actions tab
2. Click on latest workflow run
3. Check `auto-merge` job logs

## Customization

### Change Merge Strategy
Edit `.github/workflows/pr-automation.yml`:
```yaml
merge_method: 'squash'  # Options: merge, squash, rebase
```

### Change Approval Requirements
Edit `.github/workflows/pr-automation.yml`:
```javascript
const canMerge = approvals >= 1  // Change to 2 for 2 approvals
```

### Change Stale Timeframes
Edit `.github/workflows/stale.yml`:
```yaml
days-before-pr-stale: 14    # Change to 7 for 1 week
days-before-pr-close: 7     # Change to 3 for 3 days
```

### Add Custom Checks
Edit `.github/workflows/pr-automation.yml` in `code-review` job:
```bash
# Add your custom check
if echo "$CHANGED_FILES" | xargs grep -n "YOUR_PATTERN"; then
  ISSUES=$((ISSUES + 1))
  SUGGESTIONS="${SUGGESTIONS}\n- Your custom message"
fi
```

## Monitoring

### View Bot Activity
```bash
# List recent workflow runs
gh run list --workflow=pr-automation.yml

# View specific run
gh run view <run-id>

# Watch live
gh run watch
```

### Check Bot Performance
1. Go to Insights → Actions
2. View workflow run times
3. Check success rates

## Security

### Permissions
Bot has minimal permissions:
- `contents: write` - For merging
- `pull-requests: write` - For comments/labels
- `issues: write` - For closing issues
- `checks: write` - For status checks

### Secrets
No secrets required for basic operation.

For advanced features, add:
- `SLACK_WEBHOOK` - Slack notifications
- `SENTRY_DSN` - Error tracking

## Support

Issues with the bot?
1. Check [BOT_DOCUMENTATION.md](BOT_DOCUMENTATION.md)
2. View workflow logs in Actions tab
3. Open issue with `bot` label

## Updates

To update bot workflows:
1. Edit workflow files
2. Test in fork first
3. Submit PR
4. Monitor first run

## Credits

Built with GitHub Actions and ❤️ by the Tagged team.
