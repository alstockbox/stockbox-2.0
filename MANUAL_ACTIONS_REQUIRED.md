# Manual Actions Required

## 1. Enable Supabase leaked-password protection

**ACTION:** Enable leaked-password protection for `stockbox-production` (`joelaecxlksyvnmypihv`) if the Supabase organization is on Pro or above.

**WHY:** Supabase's security advisor reports leaked-password protection as disabled. Supabase uses HaveIBeenPwned Pwned Passwords to reject known-compromised passwords. This feature requires Supabase Pro or higher.

**EXACT STEPS:**
1. Open Supabase Dashboard → `stockbox-production`.
2. Go to Authentication → Providers → Email / password security settings.
3. Enable **Prevent use of leaked passwords**.
4. Keep a minimum password length of at least 8 characters and retain the existing application-side password policy.
5. Save the Auth configuration.

**EXPECTED VALUE:** Reduces credential-stuffing/account-takeover risk from passwords already present in known breach corpora.

**HOW TO VERIFY:** Run the Supabase Security Advisor again. The `auth_leaked_password_protection` warning must no longer be present. If the project is on Free, record this as an accepted plan limitation until upgrading rather than weakening application security elsewhere.

## 2. Verify and enforce GitHub `main` branch protection

**ACTION:** Require the repository's release CI check before changes can enter `main`.

**WHY:** The connected GitHub integration does not have permission to inspect or modify branch-protection settings, so this cannot be truthfully verified or enabled from the current tooling.

**EXACT STEPS:**
1. Open GitHub → `alstockbox/stockbox-2.0` → Settings → Rules → Rulesets (or Branches → Branch protection rules).
2. Create or edit the rule targeting `main`.
3. Require pull requests before merge.
4. Require the StockBox CI status check(s) that run install, lint, typecheck, tests and production build.
5. Require branches to be up to date before merging; block force pushes and deletion of `main`.
6. Keep an emergency admin bypass only if operationally necessary and auditable.

**EXPECTED VALUE:** Prevents an unverified commit from bypassing the same regression gates used for this release.

**HOW TO VERIFY:** GitHub should reject a direct unverified change to `main`, and the protection/ruleset page must show the required StockBox CI check for `main`.
