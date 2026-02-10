# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Skill Dock, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, please send an email or open a private security advisory on GitHub:

1. Go to the [Security Advisories](https://github.com/yen0304/Skill-Dock/security/advisories) page
2. Click "New draft security advisory"
3. Fill in the details of the vulnerability

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Fix & Disclosure**: Coordinated with reporter

## Scope

This policy applies to the Skill Dock VS Code extension and its dependencies. The attack surface includes:

- **Local file system access** — reading/writing skills on the user's machine
- **Webview content security** — CSP policies for skill editor and manager panels
- **Network requests** — the Marketplace feature (v0.3.0+) fetches skill metadata from the GitHub API (`api.github.com`). No user credentials are transmitted; only public repository contents are accessed.
- **Dependency vulnerabilities** — third-party npm packages bundled with the extension
