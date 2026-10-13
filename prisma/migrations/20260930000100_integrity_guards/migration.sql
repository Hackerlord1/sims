-- Database-level integrity guards. They back up the application rules so that no code path,
-- script or manual SQL session can silently rewrite investigative history or remove protected
-- records. Application code checks the same rules first and reports them to the user.

-- ───────────────── 1. Append-only history tables ─────────────────
CREATE OR REPLACE FUNCTION sims_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER evidence_access_append_only BEFORE UPDATE OR DELETE ON "EvidenceAccess" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER custody_event_append_only BEFORE UPDATE OR DELETE ON "CustodyEvent" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER evidence_version_append_only BEFORE UPDATE OR DELETE ON "EvidenceVersion" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER case_status_history_append_only BEFORE UPDATE OR DELETE ON "CaseStatusHistory" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER case_closure_append_only BEFORE UPDATE OR DELETE ON "CaseClosure" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER case_reopening_append_only BEFORE UPDATE OR DELETE ON "CaseReopening" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();
CREATE TRIGGER management_decision_append_only BEFORE UPDATE OR DELETE ON "ManagementDecision" FOR EACH ROW EXECUTE FUNCTION sims_block_mutation();

-- ───────────────── 2. Business references are immutable ─────────────────
CREATE OR REPLACE FUNCTION sims_block_reference_change() RETURNS trigger AS $$
BEGIN
  IF NEW."reference" IS DISTINCT FROM OLD."reference" THEN
    RAISE EXCEPTION '%.reference is immutable', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_reference_immutable BEFORE UPDATE ON "Case" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER subfile_reference_immutable BEFORE UPDATE ON "SubFile" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER task_reference_immutable BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER evidence_reference_immutable BEFORE UPDATE ON "Evidence" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER expense_reference_immutable BEFORE UPDATE ON "Expense" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER advance_reference_immutable BEFORE UPDATE ON "Advance" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER recovery_reference_immutable BEFORE UPDATE ON "Recovery" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER writeoff_reference_immutable BEFORE UPDATE ON "WriteOff" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER statement_reference_immutable BEFORE UPDATE ON "FinancialStatement" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER import_batch_reference_immutable BEFORE UPDATE ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER bulk_batch_reference_immutable BEFORE UPDATE ON "BulkActionBatch" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER deletion_request_reference_immutable BEFORE UPDATE ON "DeletionRequest" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();
CREATE TRIGGER report_reference_immutable BEFORE UPDATE ON "GeneratedReport" FOR EACH ROW EXECUTE FUNCTION sims_block_reference_change();

-- ───────────────── 3. Stored files: content and hash never change ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_stored_file() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."readOnly" THEN
    RAISE EXCEPTION 'Read-only stored files cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."sha256" <> OLD."sha256" OR NEW."storageKey" <> OLD."storageKey" OR (OLD."readOnly" AND NOT NEW."readOnly")) THEN
    RAISE EXCEPTION 'Stored file content, hash and read-only flag are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stored_file_guard BEFORE UPDATE OR DELETE ON "StoredFile" FOR EACH ROW EXECUTE FUNCTION sims_guard_stored_file();

-- ───────────────── 4. Evidence: originals are never deleted or replaced ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_evidence() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Original evidence cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."sha256" IS DISTINCT FROM OLD."sha256" OR NEW."originalFileId" IS DISTINCT FROM OLD."originalFileId"
     OR NEW."originalFilename" IS DISTINCT FROM OLD."originalFilename" THEN
    RAISE EXCEPTION 'Evidence original file and hash are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."isDeleted" AND NOT OLD."isDeleted" THEN
    RAISE EXCEPTION 'Original evidence cannot be deleted; archive it instead' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_guard BEFORE UPDATE OR DELETE ON "Evidence" FOR EACH ROW EXECUTE FUNCTION sims_guard_evidence();

-- ───────────────── 5. Original financial statements ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_financial_statement() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Original financial statements cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."sha256" IS DISTINCT FROM OLD."sha256" OR NEW."originalFileId" IS DISTINCT FROM OLD."originalFileId" THEN
    RAISE EXCEPTION 'Statement original file and hash are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."isDeleted" AND NOT OLD."isDeleted" THEN
    RAISE EXCEPTION 'Original financial statements cannot be deleted; archive instead' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER financial_statement_guard BEFORE UPDATE OR DELETE ON "FinancialStatement" FOR EACH ROW EXECUTE FUNCTION sims_guard_financial_statement();

-- ───────────────── 6. Signed statements ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_party_statement() RETURNS trigger AS $$
BEGIN
  IF OLD."signed" THEN
    IF TG_OP = 'DELETE' OR (NEW."isDeleted" AND NOT OLD."isDeleted") THEN
      RAISE EXCEPTION 'Signed statements cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW."summary" IS DISTINCT FROM OLD."summary" OR NEW."evidenceId" IS DISTINCT FROM OLD."evidenceId" OR NOT NEW."signed" THEN
      RAISE EXCEPTION 'Signed statements are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_statement_guard BEFORE UPDATE OR DELETE ON "PartyStatement" FOR EACH ROW EXECUTE FUNCTION sims_guard_party_statement();

-- ───────────────── 7. Verified recoveries (receipts) ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_recovery() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'VERIFIED' THEN
    IF TG_OP = 'DELETE' OR (NEW."isDeleted" AND NOT OLD."isDeleted") THEN
      RAISE EXCEPTION 'Verified recovery receipts cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW."grossAmount" <> OLD."grossAmount" OR NEW."recoveryCosts" <> OLD."recoveryCosts"
       OR NEW."status" <> OLD."status" OR NEW."caseId" <> OLD."caseId" OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber" THEN
      RAISE EXCEPTION 'Verified recoveries are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recovery_guard BEFORE UPDATE OR DELETE ON "Recovery" FOR EACH ROW EXECUTE FUNCTION sims_guard_recovery();

-- ───────────────── 8. Court orders, judgments and decrees ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_court_event() RETURNS trigger AS $$
BEGIN
  IF OLD."eventType" IN ('RULING', 'JUDGMENT', 'DECREE', 'CONSENT') OR OLD."orders" IS NOT NULL THEN
    IF TG_OP = 'DELETE' OR (NEW."isDeleted" AND NOT OLD."isDeleted") THEN
      RAISE EXCEPTION 'Court orders and judgments cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER court_event_guard BEFORE UPDATE OR DELETE ON "CourtEvent" FOR EACH ROW EXECUTE FUNCTION sims_guard_court_event();

CREATE OR REPLACE FUNCTION sims_guard_criminal_milestone() RETURNS trigger AS $$
BEGIN
  IF OLD."milestone" = 'JUDGMENT' THEN
    IF TG_OP = 'DELETE' OR (NEW."isDeleted" AND NOT OLD."isDeleted") THEN
      RAISE EXCEPTION 'Judgments cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER criminal_milestone_guard BEFORE UPDATE OR DELETE ON "CriminalMilestone" FOR EACH ROW EXECUTE FUNCTION sims_guard_criminal_milestone();

-- ───────────────── 9. Approved final reports ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_report() RETURNS trigger AS $$
BEGIN
  IF OLD."isFinal" AND OLD."approvedAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Approved final reports cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW."fileId" IS DISTINCT FROM OLD."fileId" OR NOT NEW."isFinal" OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" THEN
      RAISE EXCEPTION 'Approved final reports are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_guard BEFORE UPDATE OR DELETE ON "GeneratedReport" FOR EACH ROW EXECUTE FUNCTION sims_guard_report();

-- ───────────────── 10. Legal hold on cases ─────────────────
CREATE OR REPLACE FUNCTION sims_guard_case_legal_hold() RETURNS trigger AS $$
BEGIN
  IF OLD."legalHold" THEN
    IF TG_OP = 'DELETE' OR (NEW."isDeleted" AND NOT OLD."isDeleted") THEN
      RAISE EXCEPTION 'Cases under legal hold cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_legal_hold_guard BEFORE UPDATE OR DELETE ON "Case" FOR EACH ROW EXECUTE FUNCTION sims_guard_case_legal_hold();

-- ───────────────── 11. Money sanity checks ─────────────────
ALTER TABLE "Case" ADD CONSTRAINT case_amounts_non_negative CHECK (
  "grossAmount" >= 0 AND "amountDemanded" >= 0 AND "amountDisputed" >= 0
  AND "amountAcknowledged" >= 0 AND "amountConfirmedRecoverable" >= 0);
ALTER TABLE "SubFile" ADD CONSTRAINT subfile_amount_non_negative CHECK ("amountInvolved" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amounts_non_negative CHECK (
  "invoiceAmount" >= 0 AND "amountPaid" >= 0 AND "amountDisputed" >= 0 AND "amountAcknowledged" >= 0);
ALTER TABLE "Cheque" ADD CONSTRAINT cheque_amount_positive CHECK ("amount" > 0);
ALTER TABLE "ChequeInvoice" ADD CONSTRAINT cheque_invoice_amount_non_negative CHECK ("amount" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_amounts_valid CHECK (
  "amountBeforeTax" >= 0 AND "tax" >= 0 AND "totalAmount" = "amountBeforeTax" + "tax"
  AND "requestedAmount" >= 0 AND "approvedAmount" >= 0 AND "paidAmount" >= 0 AND "rejectedAmount" >= 0
  AND "approvedAmount" <= "requestedAmount" AND "paidAmount" <= "approvedAmount");
ALTER TABLE "Advance" ADD CONSTRAINT advance_amounts_valid CHECK (
  "amountRequested" > 0 AND "amountApproved" >= 0 AND "amountIssued" >= 0 AND "amountReturned" >= 0
  AND "amountApproved" <= "amountRequested" AND "amountIssued" <= "amountApproved" AND "amountReturned" <= "amountIssued");
ALTER TABLE "Budget" ADD CONSTRAINT budget_amount_non_negative CHECK ("approvedAmount" >= 0);
ALTER TABLE "Recovery" ADD CONSTRAINT recovery_amounts_valid CHECK ("grossAmount" > 0 AND "recoveryCosts" >= 0);
ALTER TABLE "WriteOff" ADD CONSTRAINT writeoff_amount_positive CHECK ("amount" > 0);
ALTER TABLE "Finding" ADD CONSTRAINT finding_amounts_non_negative CHECK (
  "confirmedAmount" >= 0 AND "disputedAmount" >= 0 AND "recoveredAmount" >= 0);
ALTER TABLE "StatementTransaction" ADD CONSTRAINT transaction_amounts_valid CHECK (
  "debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0));
ALTER TABLE "TransactionLink" ADD CONSTRAINT link_score_range CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "Case" ADD CONSTRAINT case_period_order CHECK (
  "incidentPeriodFrom" IS NULL OR "incidentPeriodTo" IS NULL OR "incidentPeriodFrom" <= "incidentPeriodTo");

-- ───────────────── 12. Search indexes (trigram) ─────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX case_title_trgm ON "Case" USING gin ("title" gin_trgm_ops);
CREATE INDEX case_reference_trgm ON "Case" USING gin ("reference" gin_trgm_ops);
CREATE INDEX party_name_trgm ON "Party" USING gin ("name" gin_trgm_ops);
CREATE INDEX invoice_customer_trgm ON "Invoice" USING gin ("customerName" gin_trgm_ops);
CREATE INDEX invoice_number_trgm ON "Invoice" USING gin ("invoiceNumber" gin_trgm_ops);
CREATE INDEX txn_counterparty_trgm ON "StatementTransaction" USING gin ("counterpartyName" gin_trgm_ops);
