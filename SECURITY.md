# Security Notice

## Environment File Security

⚠️ **IMPORTANT**: The `.env` file contains sensitive configuration data and has been removed from git tracking.

### What happened:
- The `.env` file was accidentally committed to git history containing sensitive data
- **Action taken**: Complete git history cleanup to remove all traces of sensitive data
- **Status**: ✅ All sensitive data successfully removed from git history

### Current security status:
- ✅ `.env` file is now properly ignored by git (`.gitignore`)
- ✅ Sensitive data completely removed from git history
- ✅ New secure values generated for all sensitive configuration
- ✅ Local development environment remains functional

### For developers:

1. **Never commit `.env` files** - They contain sensitive data
2. **Use `.env.example`** for sharing configuration templates
3. **Generate secure values** for production environments
4. **Rotate secrets regularly** as a security best practice

### If you previously cloned this repository:

Since git history was rewritten to remove sensitive data, you should:

```bash
# Option 1: Fresh clone (recommended)
git clone git@github.com:fabienpiette/folio_fox.git

# Option 2: Reset your existing clone
git fetch origin
git reset --hard origin/main
```

### Configuration values that were rotated:
- `JWT_SECRET` - New 64-character secure random string
- `REDIS_PASSWORD` - New 32-character secure random string  
- `GRAFANA_PASSWORD` - New 16-character secure random string

### Best practices going forward:
1. Always use `make create-env` to generate new `.env` files
2. Never add `.env` to git (it's now in `.gitignore`)
3. Use environment-specific configuration for different deployments
4. Regularly rotate sensitive credentials

---
**Note**: This security notice will remain in the repository to document the incident and ensure team awareness of proper security practices.