# Backup & DR Plan (Phase 3)

## Objectives

- RPO: < 15 minutes
- RTO: < 1 hour

## Backup Strategy

- Daily full backups (encrypted)
- WAL/PITR for point-in-time recovery (production only)
- Backups stored in separate account/bucket
- Retention: 30 days (adjust as needed)

## Restore Drills

- Quarterly restore drill in staging
- Document restore timing and issues

## Operational Checklist

- Verify backup job success daily
- Validate encryption key availability
- Test restore procedure quarterly

