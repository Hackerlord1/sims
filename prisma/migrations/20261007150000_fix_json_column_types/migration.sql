-- Align JSON column types with the Prisma schema.
-- Earlier migrations declared these columns in a form that Prisma reads
-- as different from `Json`, causing a `prisma migrate diff` gap on a fresh
-- database. This migration brings them in line.

ALTER TABLE `AuditLog` MODIFY `before` JSON NULL,
    MODIFY `after` JSON NULL,
    MODIFY `details` JSON NULL;

ALTER TABLE `BulkActionBatch` MODIFY `parameters` JSON NULL,
    MODIFY `recordIds` JSON NOT NULL,
    MODIFY `skipped` JSON NULL;

ALTER TABLE `CaseClosure` MODIFY `checklist` JSON NOT NULL;

ALTER TABLE `ChangeRequest` MODIFY `payload` JSON NOT NULL;

ALTER TABLE `DeletionRequest` MODIFY `entityIds` JSON NOT NULL,
    MODIFY `checks` JSON NOT NULL;

ALTER TABLE `GeneratedReport` MODIFY `filters` JSON NULL;

ALTER TABLE `ImportBatch` MODIFY `mapping` JSON NOT NULL;

ALTER TABLE `ImportRow` MODIFY `data` JSON NOT NULL,
    MODIFY `errors` JSON NOT NULL;

ALTER TABLE `Job` MODIFY `payload` JSON NOT NULL,
    MODIFY `result` JSON NULL;

ALTER TABLE `SecurityAlert` MODIFY `details` JSON NULL;

ALTER TABLE `StatementTransaction` MODIFY `flags` JSON NOT NULL;

ALTER TABLE `SystemSetting` MODIFY `value` JSON NOT NULL;

ALTER TABLE `User` MODIFY `preferences` JSON NULL,
    MODIFY `permissionDenials` JSON NOT NULL;