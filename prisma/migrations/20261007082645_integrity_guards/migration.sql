-- Database-level integrity guards (MariaDB 10.11 port of the PostgreSQL guards). They back up the
-- application rules so that no code path, script or manual SQL session can silently rewrite
-- investigative history or remove protected records. Application code checks the same rules first
-- and reports them to the user.
--
-- Port notes (see docs/MYSQL-MIGRATION-PLAN.md):
--  - MariaDB triggers fire on one event, so each PostgreSQL "BEFORE UPDATE OR DELETE" guard is split
--    into a BEFORE UPDATE and a BEFORE DELETE trigger. Where PostgreSQL had several guards on the same
--    table and event, they are folded into one trigger whose checks run in the order PostgreSQL fired
--    them (alphabetical by trigger name), so the first error reported is unchanged.
--  - RAISE EXCEPTION becomes SIGNAL SQLSTATE '45000' (error 1644). Messages are unchanged: the API
--    maps them to PROTECTED_RECORD responses (src/server/api/errors.ts).
--  - IS DISTINCT FROM becomes NOT (a <=> b). Plain <> is kept where both sides are NOT NULL.
--  - Foreign-key cascades do NOT fire triggers in MariaDB. Two guards below (sections 10 and 12)
--    run on the parent row instead, so that a cascade cannot do what the child's trigger forbids.
--  - Each trigger is dropped first so the file can be re-applied by hand during development.

-- ───────────────── 1. Append-only history tables ─────────────────

DROP TRIGGER IF EXISTS `probe_audit_log_bu`;

DROP TRIGGER IF EXISTS `audit_log_append_only_bu`;
CREATE TRIGGER `audit_log_append_only_bu` BEFORE UPDATE ON `AuditLog` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `audit_log_append_only_bd`;
CREATE TRIGGER `audit_log_append_only_bd` BEFORE DELETE ON `AuditLog` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only (DELETE blocked)';

DROP TRIGGER IF EXISTS `evidence_access_append_only_bu`;
CREATE TRIGGER `evidence_access_append_only_bu` BEFORE UPDATE ON `EvidenceAccess` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EvidenceAccess is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `evidence_access_append_only_bd`;
CREATE TRIGGER `evidence_access_append_only_bd` BEFORE DELETE ON `EvidenceAccess` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EvidenceAccess is append-only (DELETE blocked)';

DROP TRIGGER IF EXISTS `custody_event_append_only_bu`;
CREATE TRIGGER `custody_event_append_only_bu` BEFORE UPDATE ON `CustodyEvent` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CustodyEvent is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `custody_event_append_only_bd`;
CREATE TRIGGER `custody_event_append_only_bd` BEFORE DELETE ON `CustodyEvent` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CustodyEvent is append-only (DELETE blocked)';

DROP TRIGGER IF EXISTS `evidence_version_append_only_bu`;
CREATE TRIGGER `evidence_version_append_only_bu` BEFORE UPDATE ON `EvidenceVersion` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EvidenceVersion is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `evidence_version_append_only_bd`;
CREATE TRIGGER `evidence_version_append_only_bd` BEFORE DELETE ON `EvidenceVersion` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EvidenceVersion is append-only (DELETE blocked)';

DROP TRIGGER IF EXISTS `management_decision_append_only_bu`;
CREATE TRIGGER `management_decision_append_only_bu` BEFORE UPDATE ON `ManagementDecision` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ManagementDecision is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `management_decision_append_only_bd`;
CREATE TRIGGER `management_decision_append_only_bd` BEFORE DELETE ON `ManagementDecision` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ManagementDecision is append-only (DELETE blocked)';

-- ───────────────── 2. Case history: append-only except during an approved purge ─────────────────
-- PostgreSQL read `current_setting('sims.purge_case')`, set with SET LOCAL by the purge transaction.
-- MariaDB has no transaction-scoped setting a trigger can read, so the purge transaction inserts a
-- PurgeToken row (caseId, CONNECTION_ID()) and deletes it again before committing. A delete is
-- allowed only while a token for that case exists for the current connection. The row is
-- uncommitted, so no other connection can see it; even a READ UNCOMMITTED session elsewhere has a
-- different CONNECTION_ID(). The audit log is NOT covered by this exception.

DROP TRIGGER IF EXISTS `case_status_history_append_only_bu`;
CREATE TRIGGER `case_status_history_append_only_bu` BEFORE UPDATE ON `CaseStatusHistory` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseStatusHistory is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `case_status_history_append_only_bd`;
CREATE TRIGGER `case_status_history_append_only_bd` BEFORE DELETE ON `CaseStatusHistory` FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `PurgeToken` WHERE `caseId` = OLD.`caseId` AND `connectionId` = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseStatusHistory is append-only (DELETE blocked)';
  END IF;
END;

DROP TRIGGER IF EXISTS `case_closure_append_only_bu`;
CREATE TRIGGER `case_closure_append_only_bu` BEFORE UPDATE ON `CaseClosure` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseClosure is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `case_closure_append_only_bd`;
CREATE TRIGGER `case_closure_append_only_bd` BEFORE DELETE ON `CaseClosure` FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `PurgeToken` WHERE `caseId` = OLD.`caseId` AND `connectionId` = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseClosure is append-only (DELETE blocked)';
  END IF;
END;

DROP TRIGGER IF EXISTS `case_reopening_append_only_bu`;
CREATE TRIGGER `case_reopening_append_only_bu` BEFORE UPDATE ON `CaseReopening` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseReopening is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `case_reopening_append_only_bd`;
CREATE TRIGGER `case_reopening_append_only_bd` BEFORE DELETE ON `CaseReopening` FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `PurgeToken` WHERE `caseId` = OLD.`caseId` AND `connectionId` = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CaseReopening is append-only (DELETE blocked)';
  END IF;
END;

-- Purge tokens: a connection may only create and remove its own tokens, and never alter one.
DROP TRIGGER IF EXISTS `purge_token_guard_bi`;
CREATE TRIGGER `purge_token_guard_bi` BEFORE INSERT ON `PurgeToken` FOR EACH ROW
BEGIN
  IF NEW.`connectionId` <> CONNECTION_ID() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A purge token can only be issued for the current connection';
  END IF;
END;
DROP TRIGGER IF EXISTS `purge_token_guard_bu`;
CREATE TRIGGER `purge_token_guard_bu` BEFORE UPDATE ON `PurgeToken` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PurgeToken is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS `purge_token_guard_bd`;
CREATE TRIGGER `purge_token_guard_bd` BEFORE DELETE ON `PurgeToken` FOR EACH ROW
BEGIN
  IF OLD.`connectionId` <> CONNECTION_ID() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A purge token can only be removed by its own connection';
  END IF;
END;

-- ───────────────── 3. Business references are immutable ─────────────────
-- Tables whose only UPDATE guard is the reference. Case, Evidence, Recovery, FinancialStatement and
-- GeneratedReport carry the same check inside their combined guards below.

DROP TRIGGER IF EXISTS `subfile_reference_immutable_bu`;
CREATE TRIGGER `subfile_reference_immutable_bu` BEFORE UPDATE ON `SubFile` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubFile.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `task_reference_immutable_bu`;
CREATE TRIGGER `task_reference_immutable_bu` BEFORE UPDATE ON `Task` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `expense_reference_immutable_bu`;
CREATE TRIGGER `expense_reference_immutable_bu` BEFORE UPDATE ON `Expense` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expense.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `advance_reference_immutable_bu`;
CREATE TRIGGER `advance_reference_immutable_bu` BEFORE UPDATE ON `Advance` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Advance.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `writeoff_reference_immutable_bu`;
CREATE TRIGGER `writeoff_reference_immutable_bu` BEFORE UPDATE ON `WriteOff` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'WriteOff.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `import_batch_reference_immutable_bu`;
CREATE TRIGGER `import_batch_reference_immutable_bu` BEFORE UPDATE ON `ImportBatch` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ImportBatch.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `bulk_batch_reference_immutable_bu`;
CREATE TRIGGER `bulk_batch_reference_immutable_bu` BEFORE UPDATE ON `BulkActionBatch` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'BulkActionBatch.reference is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS `deletion_request_reference_immutable_bu`;
CREATE TRIGGER `deletion_request_reference_immutable_bu` BEFORE UPDATE ON `DeletionRequest` FOR EACH ROW
BEGIN
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DeletionRequest.reference is immutable';
  END IF;
END;

-- ───────────────── 4. Stored files: content and hash never change ─────────────────

DROP TRIGGER IF EXISTS `stored_file_guard_bu`;
CREATE TRIGGER `stored_file_guard_bu` BEFORE UPDATE ON `StoredFile` FOR EACH ROW
BEGIN
  IF NEW.`sha256` <> OLD.`sha256` OR NEW.`storageKey` <> OLD.`storageKey` OR (OLD.`readOnly` AND NOT NEW.`readOnly`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stored file content, hash and read-only flag are immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `stored_file_guard_bd`;
CREATE TRIGGER `stored_file_guard_bd` BEFORE DELETE ON `StoredFile` FOR EACH ROW
BEGIN
  IF OLD.`readOnly` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Read-only stored files cannot be deleted';
  END IF;
END;

-- ───────────────── 5. Evidence: originals are never deleted or replaced ─────────────────
-- PostgreSQL order: evidence_guard, then evidence_reference_immutable.

DROP TRIGGER IF EXISTS `evidence_guard_bu`;
CREATE TRIGGER `evidence_guard_bu` BEFORE UPDATE ON `Evidence` FOR EACH ROW
BEGIN
  IF NOT (NEW.`sha256` <=> OLD.`sha256`) OR NOT (NEW.`originalFileId` <=> OLD.`originalFileId`)
     OR NOT (NEW.`originalFilename` <=> OLD.`originalFilename`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Evidence original file and hash are immutable';
  END IF;
  IF NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Original evidence cannot be deleted; archive it instead';
  END IF;
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Evidence.reference is immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `evidence_guard_bd`;
CREATE TRIGGER `evidence_guard_bd` BEFORE DELETE ON `Evidence` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Original evidence cannot be deleted';

-- ───────────────── 6. Original financial statements ─────────────────
-- PostgreSQL order: financial_statement_guard, then statement_reference_immutable.

DROP TRIGGER IF EXISTS `financial_statement_guard_bu`;
CREATE TRIGGER `financial_statement_guard_bu` BEFORE UPDATE ON `FinancialStatement` FOR EACH ROW
BEGIN
  IF NOT (NEW.`sha256` <=> OLD.`sha256`) OR NOT (NEW.`originalFileId` <=> OLD.`originalFileId`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Statement original file and hash are immutable';
  END IF;
  IF NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Original financial statements cannot be deleted; archive instead';
  END IF;
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FinancialStatement.reference is immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `financial_statement_guard_bd`;
CREATE TRIGGER `financial_statement_guard_bd` BEFORE DELETE ON `FinancialStatement` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Original financial statements cannot be deleted';

-- ───────────────── 7. Signed statements ─────────────────

DROP TRIGGER IF EXISTS `party_statement_guard_bu`;
CREATE TRIGGER `party_statement_guard_bu` BEFORE UPDATE ON `PartyStatement` FOR EACH ROW
BEGIN
  IF OLD.`signed` THEN
    IF NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Signed statements cannot be deleted';
    END IF;
    IF NOT (NEW.`summary` <=> OLD.`summary`) OR NOT (NEW.`evidenceId` <=> OLD.`evidenceId`) OR NOT NEW.`signed` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Signed statements are immutable';
    END IF;
  END IF;
END;
DROP TRIGGER IF EXISTS `party_statement_guard_bd`;
CREATE TRIGGER `party_statement_guard_bd` BEFORE DELETE ON `PartyStatement` FOR EACH ROW
BEGIN
  IF OLD.`signed` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Signed statements cannot be deleted';
  END IF;
END;

-- ───────────────── 8. Verified recoveries (receipts) ─────────────────
-- PostgreSQL order: recovery_guard, then recovery_reference_immutable.

DROP TRIGGER IF EXISTS `recovery_guard_bu`;
CREATE TRIGGER `recovery_guard_bu` BEFORE UPDATE ON `Recovery` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'VERIFIED' THEN
    IF NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verified recovery receipts cannot be deleted';
    END IF;
    IF NEW.`grossAmount` <> OLD.`grossAmount` OR NEW.`recoveryCosts` <> OLD.`recoveryCosts`
       OR NEW.`status` <> OLD.`status` OR NEW.`caseId` <> OLD.`caseId` OR NOT (NEW.`receiptNumber` <=> OLD.`receiptNumber`) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verified recoveries are immutable';
    END IF;
  END IF;
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Recovery.reference is immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `recovery_guard_bd`;
CREATE TRIGGER `recovery_guard_bd` BEFORE DELETE ON `Recovery` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'VERIFIED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verified recovery receipts cannot be deleted';
  END IF;
END;

-- ───────────────── 9. Court orders, judgments and decrees ─────────────────

DROP TRIGGER IF EXISTS `court_event_guard_bu`;
CREATE TRIGGER `court_event_guard_bu` BEFORE UPDATE ON `CourtEvent` FOR EACH ROW
BEGIN
  IF (OLD.`eventType` IN ('RULING', 'JUDGMENT', 'DECREE', 'CONSENT') OR OLD.`orders` IS NOT NULL)
     AND NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Court orders and judgments cannot be deleted';
  END IF;
END;
DROP TRIGGER IF EXISTS `court_event_guard_bd`;
CREATE TRIGGER `court_event_guard_bd` BEFORE DELETE ON `CourtEvent` FOR EACH ROW
BEGIN
  IF OLD.`eventType` IN ('RULING', 'JUDGMENT', 'DECREE', 'CONSENT') OR OLD.`orders` IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Court orders and judgments cannot be deleted';
  END IF;
END;

DROP TRIGGER IF EXISTS `criminal_milestone_guard_bu`;
CREATE TRIGGER `criminal_milestone_guard_bu` BEFORE UPDATE ON `CriminalMilestone` FOR EACH ROW
BEGIN
  IF OLD.`milestone` = 'JUDGMENT' AND NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Judgments cannot be deleted';
  END IF;
END;
DROP TRIGGER IF EXISTS `criminal_milestone_guard_bd`;
CREATE TRIGGER `criminal_milestone_guard_bd` BEFORE DELETE ON `CriminalMilestone` FOR EACH ROW
BEGIN
  IF OLD.`milestone` = 'JUDGMENT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Judgments cannot be deleted';
  END IF;
END;

-- ───────────────── 10. Approved final reports ─────────────────
-- PostgreSQL order: report_guard, then report_reference_immutable.

DROP TRIGGER IF EXISTS `report_guard_bu`;
CREATE TRIGGER `report_guard_bu` BEFORE UPDATE ON `GeneratedReport` FOR EACH ROW
BEGIN
  IF OLD.`isFinal` AND OLD.`approvedAt` IS NOT NULL THEN
    IF NOT (NEW.`fileId` <=> OLD.`fileId`) OR NOT NEW.`isFinal` OR NOT (NEW.`approvedAt` <=> OLD.`approvedAt`) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approved final reports are immutable';
    END IF;
  END IF;
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GeneratedReport.reference is immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `report_guard_bd`;
CREATE TRIGGER `report_guard_bd` BEFORE DELETE ON `GeneratedReport` FOR EACH ROW
BEGIN
  IF OLD.`isFinal` AND OLD.`approvedAt` IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approved final reports cannot be deleted';
  END IF;
END;

-- ───────────────── 11. Cases: legal hold, immutable reference, protected history ─────────────────
-- PostgreSQL order on UPDATE: case_legal_hold_guard, then case_reference_immutable.
--
-- NEW (no PostgreSQL counterpart needed): CaseStatusHistory, CaseClosure and CaseReopening reference
-- Case with ON DELETE CASCADE. In PostgreSQL a cascaded delete fires the history triggers, so a case
-- with history could only be deleted inside a purge. MariaDB does not fire triggers for cascaded
-- deletes, so the same rule is enforced here, on the parent row, before the cascade runs.

DROP TRIGGER IF EXISTS `case_guard_bu`;
CREATE TRIGGER `case_guard_bu` BEFORE UPDATE ON `Case` FOR EACH ROW
BEGIN
  IF OLD.`legalHold` AND NEW.`isDeleted` AND NOT OLD.`isDeleted` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cases under legal hold cannot be deleted';
  END IF;
  IF NOT (NEW.`reference` <=> OLD.`reference`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Case.reference is immutable';
  END IF;
END;
DROP TRIGGER IF EXISTS `case_guard_bd`;
CREATE TRIGGER `case_guard_bd` BEFORE DELETE ON `Case` FOR EACH ROW
BEGIN
  IF OLD.`legalHold` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cases under legal hold cannot be deleted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM `PurgeToken` WHERE `caseId` = OLD.`id` AND `connectionId` = CONNECTION_ID())
     AND (EXISTS (SELECT 1 FROM `CaseStatusHistory` WHERE `caseId` = OLD.`id`)
          OR EXISTS (SELECT 1 FROM `CaseClosure` WHERE `caseId` = OLD.`id`)
          OR EXISTS (SELECT 1 FROM `CaseReopening` WHERE `caseId` = OLD.`id`)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Case history is append-only (DELETE blocked)';
  END IF;
END;

-- ───────────────── 12. Users referenced by the audit log ─────────────────
-- NEW: AuditLog.actorId references User with ON DELETE SET NULL. In PostgreSQL that SET NULL is an
-- UPDATE on AuditLog, which the append-only trigger rejects, so such a user could not be deleted.
-- MariaDB does not fire triggers for cascaded actions, so the rule is enforced on the User row.

DROP TRIGGER IF EXISTS `user_audit_guard_bd`;
CREATE TRIGGER `user_audit_guard_bd` BEFORE DELETE ON `User` FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `AuditLog` WHERE `actorId` = OLD.`id`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Users referenced by the audit log cannot be deleted';
  END IF;
END;

-- ───────────────── 13. Money sanity checks ─────────────────
-- Ported verbatim; MariaDB enforces CHECK constraints (10.2+), whatever the sql_mode.

ALTER TABLE `Case` ADD CONSTRAINT `case_amounts_non_negative` CHECK (
  `grossAmount` >= 0 AND `amountDemanded` >= 0 AND `amountDisputed` >= 0
  AND `amountAcknowledged` >= 0 AND `amountConfirmedRecoverable` >= 0);
ALTER TABLE `SubFile` ADD CONSTRAINT `subfile_amount_non_negative` CHECK (`amountInvolved` >= 0);
ALTER TABLE `Invoice` ADD CONSTRAINT `invoice_amounts_non_negative` CHECK (
  `invoiceAmount` >= 0 AND `amountPaid` >= 0 AND `amountDisputed` >= 0 AND `amountAcknowledged` >= 0);
ALTER TABLE `Cheque` ADD CONSTRAINT `cheque_amount_positive` CHECK (`amount` > 0);
ALTER TABLE `ChequeInvoice` ADD CONSTRAINT `cheque_invoice_amount_non_negative` CHECK (`amount` >= 0);
ALTER TABLE `Expense` ADD CONSTRAINT `expense_amounts_valid` CHECK (
  `amountBeforeTax` >= 0 AND `tax` >= 0 AND `totalAmount` = `amountBeforeTax` + `tax`
  AND `requestedAmount` >= 0 AND `approvedAmount` >= 0 AND `paidAmount` >= 0 AND `rejectedAmount` >= 0
  AND `approvedAmount` <= `requestedAmount` AND `paidAmount` <= `approvedAmount`);
ALTER TABLE `Advance` ADD CONSTRAINT `advance_amounts_valid` CHECK (
  `amountRequested` > 0 AND `amountApproved` >= 0 AND `amountIssued` >= 0 AND `amountReturned` >= 0
  AND `amountApproved` <= `amountRequested` AND `amountIssued` <= `amountApproved` AND `amountReturned` <= `amountIssued`);
ALTER TABLE `Budget` ADD CONSTRAINT `budget_amount_non_negative` CHECK (`approvedAmount` >= 0);
ALTER TABLE `Recovery` ADD CONSTRAINT `recovery_amounts_valid` CHECK (`grossAmount` > 0 AND `recoveryCosts` >= 0);
ALTER TABLE `WriteOff` ADD CONSTRAINT `writeoff_amount_positive` CHECK (`amount` > 0);
ALTER TABLE `Finding` ADD CONSTRAINT `finding_amounts_non_negative` CHECK (
  `confirmedAmount` >= 0 AND `disputedAmount` >= 0 AND `recoveredAmount` >= 0);
ALTER TABLE `StatementTransaction` ADD CONSTRAINT `transaction_amounts_valid` CHECK (
  `debit` >= 0 AND `credit` >= 0 AND NOT (`debit` > 0 AND `credit` > 0));
ALTER TABLE `TransactionLink` ADD CONSTRAINT `link_score_range` CHECK (`score` BETWEEN 0 AND 100);
ALTER TABLE `Case` ADD CONSTRAINT `case_period_order` CHECK (
  `incidentPeriodFrom` IS NULL OR `incidentPeriodTo` IS NULL OR `incidentPeriodFrom` <= `incidentPeriodTo`);

-- ───────────────── 14. Search indexes ─────────────────
-- The PostgreSQL pg_trgm GIN indexes have no MariaDB equivalent and are not recreated. Substring
-- search (`contains`, i.e. LIKE '%q%') returns the same results without them; see the migration plan.
