-- Case history (status history, closures, reopenings) stays append-only, except when an approved
-- permanent-deletion request purges the whole case. The purge transaction sets
-- `SET LOCAL sims.purge_case = '<case id>'`; only rows of that case can then be removed.
-- The audit log is NOT covered by this exception and remains strictly append-only.
CREATE OR REPLACE FUNCTION sims_block_case_history_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sims.purge_case', true) = OLD."caseId" THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER case_status_history_append_only ON "CaseStatusHistory";
DROP TRIGGER case_closure_append_only ON "CaseClosure";
DROP TRIGGER case_reopening_append_only ON "CaseReopening";

CREATE TRIGGER case_status_history_append_only BEFORE UPDATE OR DELETE ON "CaseStatusHistory" FOR EACH ROW EXECUTE FUNCTION sims_block_case_history_mutation();
CREATE TRIGGER case_closure_append_only BEFORE UPDATE OR DELETE ON "CaseClosure" FOR EACH ROW EXECUTE FUNCTION sims_block_case_history_mutation();
CREATE TRIGGER case_reopening_append_only BEFORE UPDATE OR DELETE ON "CaseReopening" FOR EACH ROW EXECUTE FUNCTION sims_block_case_history_mutation();
