-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SYSTEM_ADMIN', 'LEAD_INVESTIGATOR', 'INVESTIGATOR', 'INTERNAL_AUDIT_REVIEWER', 'COMPLIANCE_REVIEWER', 'LEGAL_OFFICER', 'HR_OFFICER', 'FINANCE_REVIEWER', 'MANAGEMENT_APPROVER', 'EXECUTIVE_READ_ONLY', 'EXTERNAL_ADVOCATE_RESTRICTED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseCategory" AS ENUM ('INVOICE_IRREGULARITY', 'BAD_CHEQUE', 'FINANCIAL_MISCONDUCT', 'CUSTOMER_DEBT', 'CASH_MISAPPROPRIATION', 'STOCK_LOSS', 'PROCUREMENT_FRAUD', 'PAYROLL_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'PRELIMINARY_REVIEW', 'UNDER_INTERNAL_INVESTIGATION', 'AWAITING_DOCUMENTS', 'AWAITING_INTERVIEW', 'AWAITING_MANAGEMENT_DECISION', 'REFERRED_FOR_CRIMINAL_ACTION', 'REFERRED_FOR_CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_PROCESS', 'WRITE_OFF_APPROVAL', 'RECOVERY_MONITORING', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "InvestigationStage" AS ENUM ('INTAKE', 'PLANNING', 'EVIDENCE_GATHERING', 'INTERVIEWS', 'ANALYSIS', 'REPORTING', 'ACTION', 'MONITORING', 'CONCLUDED');

-- CreateEnum
CREATE TYPE "CaseAssignmentRole" AS ENUM ('LEAD', 'SUPPORTING', 'SUPERVISOR', 'REVIEWER', 'LEGAL', 'HR', 'FINANCE', 'EXTERNAL_ADVOCATE');

-- CreateEnum
CREATE TYPE "SubFileStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('PERSON_OF_INTEREST', 'SUSPECT_REPORTED_TO_AUTHORITIES', 'WITNESS', 'EMPLOYEE', 'CUSTOMER', 'COMPLAINANT', 'GUARANTOR', 'POLICE_OR_DCI_OFFICER', 'ADVOCATE', 'OTHER_PARTY');

-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('INDIVIDUAL', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "InvoiceClassification" AS ENUM ('VALID_AND_SUPPORTED', 'VALID_BUT_UNPAID', 'DISPUTED', 'CUSTOMER_NOT_IDENTIFIED', 'NO_PROOF_OF_DELIVERY', 'DUPLICATE', 'PRESALE_INVOICE', 'FICTITIOUS_INVOICE_SUSPECTED', 'RAISED_UNDER_MANAGEMENT_INSTRUCTION', 'PAYMENT_MADE_TO_EMPLOYEE', 'CASH_COLLECTED_NOT_REMITTED', 'MPESA_PAID_TO_PERSONAL_NUMBER', 'PARTLY_PAID', 'REQUIRES_FURTHER_INVESTIGATION', 'CLEARED');

-- CreateEnum
CREATE TYPE "ProofOfDeliveryStatus" AS ENUM ('AVAILABLE', 'MISSING', 'PARTIAL', 'DISPUTED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ErpPostingStatus" AS ENUM ('POSTED', 'NOT_POSTED', 'REVERSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CustomerVerificationOutcome" AS ENUM ('NOT_CONTACTED', 'CONFIRMED', 'PARTLY_CONFIRMED', 'DISPUTED', 'CUSTOMER_NOT_FOUND');

-- CreateEnum
CREATE TYPE "RecoveryProgress" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PARTLY_RECOVERED', 'RECOVERED', 'WRITTEN_OFF', 'NOT_RECOVERABLE');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('RECEIVED', 'DEPOSITED', 'CLEARED', 'DISHONOURED', 'REPLACED', 'RECOVERED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "CriminalComplaintStatus" AS ENUM ('NOT_REPORTED', 'REPORTED', 'UNDER_INVESTIGATION', 'CHARGED', 'CONCLUDED', 'NOT_PURSUED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('FACT_FINDING', 'PERSON_OF_INTEREST', 'WITNESS', 'CUSTOMER_VERIFICATION', 'FOLLOW_UP', 'EXIT');

-- CreateEnum
CREATE TYPE "StatementKind" AS ENUM ('WITNESS_STATEMENT', 'EMPLOYEE_EXPLANATION', 'CUSTOMER_CONFIRMATION', 'POLICE_STATEMENT', 'AFFIDAVIT', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkLogStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SupervisorReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'RETURNED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_FOR_INTERNAL_PARTY', 'WAITING_FOR_EXTERNAL_PARTY', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('GENERAL', 'DOCUMENT_REQUEST', 'INTERVIEW', 'COURT_DATE', 'MANAGEMENT_APPROVAL', 'POLICE_FOLLOW_UP', 'DCI_FOLLOW_UP', 'DPP_FOLLOW_UP', 'ADVOCATE_FOLLOW_UP', 'DEMAND_FOLLOW_UP', 'RECOVERY_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('DOCUMENT', 'INVOICE_COPY', 'DELIVERY_NOTE', 'CHEQUE_IMAGE', 'BANK_RETURN_MEMO', 'SIGNED_STATEMENT', 'IDENTIFICATION_DOCUMENT', 'FINANCIAL_STATEMENT', 'PHOTOGRAPH', 'AUDIO', 'VIDEO', 'EMAIL_OR_MESSAGE', 'COURT_ORDER', 'JUDGMENT', 'RECEIPT', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceAccessAction" AS ENUM ('UPLOAD', 'VIEW', 'PREVIEW', 'DOWNLOAD', 'NEW_WORKING_VERSION', 'HASH_VERIFIED', 'HASH_MISMATCH', 'LEGAL_HOLD_ON', 'LEGAL_HOLD_OFF', 'METADATA_EDIT');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'DECIDED');

-- CreateEnum
CREATE TYPE "EvidenceSufficiency" AS ENUM ('SUFFICIENT', 'PARTLY_SUFFICIENT', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('NO_FURTHER_ACTION', 'ADDITIONAL_INVESTIGATION', 'CRIMINAL_ACTION', 'CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_OR_ADMINISTRATIVE_ACTION', 'INSURANCE_CLAIM', 'DEBT_RECOVERY_ARRANGEMENT', 'WRITE_OFF', 'CONTROL_IMPROVEMENT', 'EMPLOYEE_TRAINING', 'REFERRAL_TO_ANOTHER_AUTHORITY');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'RETURNED_FOR_MORE_WORK', 'REJECTED');

-- CreateEnum
CREATE TYPE "CriminalStatus" AS ENUM ('PREPARING', 'REPORTED', 'UNDER_POLICE_INVESTIGATION', 'WITH_DPP', 'CHARGED', 'IN_COURT', 'CONCLUDED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CriminalMilestoneType" AS ENUM ('COMPLAINT_RECORDED', 'OB_NUMBER_OBTAINED', 'STATEMENTS_RECORDED', 'SUSPECT_INTERVIEWED', 'AFFIDAVIT_PREPARED', 'FINANCIAL_INSTITUTION_SERVED', 'BANK_RESPONSE_RECEIVED', 'MPESA_RESPONSE_RECEIVED', 'FORENSIC_ANALYSIS_COMPLETED', 'FILE_FORWARDED_TO_DPP', 'DPP_DIRECTIONS_RECEIVED', 'FURTHER_INVESTIGATION_REQUESTED', 'DECISION_TO_CHARGE', 'WARRANT_ISSUED', 'ARREST_COMPLETED', 'BOND_OR_BAIL', 'PLEA_TAKEN', 'TRIAL', 'JUDGMENT', 'CLOSURE');

-- CreateEnum
CREATE TYPE "CivilStatus" AS ENUM ('REFERRED', 'DEMAND_ISSUED', 'NEGOTIATION', 'APPROVED_TO_SUE', 'FILED', 'IN_COURT', 'JUDGMENT_OBTAINED', 'EXECUTION', 'SETTLED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CourtEventType" AS ENUM ('MENTION', 'HEARING', 'APPLICATION', 'RULING', 'MEDIATION', 'NEGOTIATION', 'CONSENT', 'JUDGMENT', 'DECREE', 'EXECUTION', 'GARNISHEE_PROCEEDINGS', 'AUCTION', 'PAYMENT_PLAN', 'APPEAL', 'CLOSURE');

-- CreateEnum
CREATE TYPE "DisciplinaryStatus" AS ENUM ('HR_REFERRAL', 'SHOW_CAUSE_ISSUED', 'RESPONSE_RECEIVED', 'HEARING_SCHEDULED', 'DECISION_MADE', 'UNDER_APPEAL', 'FINAL_OUTCOME', 'CLOSED');

-- CreateEnum
CREATE TYPE "WriteOffStatus" AS ENUM ('DRAFT', 'FINANCE_REVIEW', 'MANAGEMENT_APPROVAL', 'BOARD_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CostPathway" AS ENUM ('INVESTIGATION', 'CRIMINAL', 'CIVIL', 'RECOVERY');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TRANSPORT', 'FUEL', 'MILEAGE', 'VEHICLE_HIRE', 'ACCOMMODATION', 'MEALS', 'SUBSISTENCE', 'FIELD_ALLOWANCE', 'AIRTIME', 'DATA', 'PRINTING', 'PHOTOCOPYING', 'COURIER', 'CERTIFICATION', 'INTERVIEW_COSTS', 'EXTERNAL_INVESTIGATOR', 'FORENSIC_ANALYSIS', 'BANK_STATEMENT_CHARGES', 'MPESA_STATEMENT_CHARGES', 'ADVOCATE_FEES', 'COURT_FILING_FEES', 'PROCESS_SERVER', 'WITNESS_COSTS', 'AUCTIONEER', 'ASSET_TRACING', 'VALUATION', 'RECOVERY_AGENT', 'OTHER_APPROVED_EXPENSE');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'AWAITING_RECEIPT', 'ACCOUNTED_FOR', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CORPORATE_CARD', 'PETTY_CASH', 'IMPREST', 'OTHER');

-- CreateEnum
CREATE TYPE "Recoverability" AS ENUM ('UNDER_REVIEW', 'RECOVERABLE', 'NOT_RECOVERABLE');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED', 'PARTLY_ACCOUNTED', 'ACCOUNTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REVISED');

-- CreateEnum
CREATE TYPE "RecoveryMethod" AS ENUM ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'SALARY_DEDUCTION', 'COURT_EXECUTION', 'GARNISHEE', 'AUCTION_PROCEEDS', 'INSURANCE', 'SET_OFF', 'OTHER');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('RECORDED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('BANK', 'MPESA', 'SACCO', 'OTHER');

-- CreateEnum
CREATE TYPE "StatementFormat" AS ENUM ('PDF', 'SCANNED_PDF', 'CSV', 'XLSX', 'MPESA_PDF', 'BANK_PDF');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PARSING', 'PARSED', 'NEEDS_MANUAL_REVIEW', 'FAILED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "LinkClass" AS ENUM ('VERIFIED_DIRECT_MATCH', 'EXACT_REFERENCE_MATCH', 'PROBABLE_NAME_MATCH', 'TELEPHONE_NUMBER_MATCH', 'USER_CONFIRMED_MATCH', 'UNRESOLVED_POSSIBLE_MATCH');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LinkTarget" AS ENUM ('PARTY', 'STATEMENT_OWNER', 'INVOICE', 'CHEQUE', 'KNOWN_ACCOUNT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATED', 'QUEUED', 'IMPORTING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('ATOMIC', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DuplicateStrategy" AS ENUM ('SKIP', 'UPDATE_EXISTING', 'CREATE_NEW_VERSION', 'IMPORT_SEPARATELY', 'STOP_ENTIRE_BATCH');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'UPDATED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "BulkActionType" AS ENUM ('ARCHIVE', 'UNARCHIVE', 'SOFT_DELETE', 'RESTORE', 'REASSIGN', 'CHANGE_STATUS', 'EXPORT');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'DOCX', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('REPEATED_FAILED_LOGINS', 'PERMISSION_BYPASS_ATTEMPT', 'LARGE_EXPORT', 'EVIDENCE_HASH_MISMATCH', 'ADMIN_ROLE_CHANGE', 'DEMO_MODE_IN_PRODUCTION', 'PERMANENT_DELETION', 'BULK_IMPORT_FAILURE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "telephone" TEXT,
    "jobTitle" TEXT,
    "role" "RoleCode" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "clearance" "Confidentiality" NOT NULL DEFAULT 'STANDARD',
    "companyId" TEXT,
    "branchId" TEXT,
    "departmentId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "externalIdentityId" TEXT,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB,
    "isDemoAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "reauthAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessUnit" TEXT,
    "branchId" TEXT,
    "location" TEXT,
    "category" "CaseCategory" NOT NULL,
    "description" TEXT,
    "allegationSummary" TEXT,
    "referralSource" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incidentDate" TIMESTAMP(3),
    "incidentPeriodFrom" TIMESTAMP(3),
    "incidentPeriodTo" TIMESTAMP(3),
    "leadInvestigatorId" TEXT,
    "supervisingManagerId" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'CONFIDENTIAL',
    "financialRisk" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" "InvestigationStage" NOT NULL DEFAULT 'INTAKE',
    "targetClosureDate" TIMESTAMP(3),
    "actualClosureDate" TIMESTAMP(3),
    "closureReason" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "grossAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountDemanded" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountDisputed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountAcknowledged" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountConfirmedRecoverable" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAssignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CaseAssignmentRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStatusHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "CaseStatus",
    "toStatus" "CaseStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseClosure" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseReopening" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "newInformation" TEXT NOT NULL,
    "previousStatus" "CaseStatus" NOT NULL,
    "reopenedById" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseReopening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubFile" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "allegation" TEXT,
    "transactionType" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "investigatorId" TEXT,
    "amountInvolved" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "SubFileStatus" NOT NULL DEFAULT 'OPEN',
    "findings" TEXT,
    "recommendation" TEXT,
    "targetDate" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SubFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "kind" "PartyKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "idNumber" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "organisation" TEXT,
    "employeeNumber" TEXT,
    "customerCode" TEXT,
    "relationshipToCase" TEXT,
    "accessClassification" "Confidentiality" NOT NULL DEFAULT 'CONFIDENTIAL',
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerCode" TEXT,
    "salesLocation" TEXT,
    "deliveryLocation" TEXT,
    "invoiceAmount" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountDisputed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountAcknowledged" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salesRepresentative" TEXT,
    "deliveryPerson" TEXT,
    "vehicleReference" TEXT,
    "deliveryNoteNumber" TEXT,
    "proofOfDelivery" "ProofOfDeliveryStatus" NOT NULL DEFAULT 'MISSING',
    "erpPostingStatus" "ErpPostingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "customerVerification" "CustomerVerificationOutcome" NOT NULL DEFAULT 'NOT_CONTACTED',
    "classification" "InvoiceClassification" NOT NULL DEFAULT 'REQUIRES_FURTHER_INVESTIGATION',
    "observations" TEXT,
    "responsiblePerson" TEXT,
    "recoveryStatus" "RecoveryProgress" NOT NULL DEFAULT 'NOT_STARTED',
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "chequeNumber" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "bankBranch" TEXT,
    "accountNumberMasked" TEXT,
    "accountName" TEXT,
    "chequeDate" TIMESTAMP(3),
    "amount" DECIMAL(18,2) NOT NULL,
    "dateReceived" TIMESTAMP(3),
    "dateDeposited" TIMESTAMP(3),
    "dateDishonoured" TIMESTAMP(3),
    "dishonourReason" TEXT,
    "bankReturnReference" TEXT,
    "issuer" TEXT NOT NULL,
    "receivedByEmployee" TEXT,
    "status" "ChequeStatus" NOT NULL DEFAULT 'RECEIVED',
    "replacementChequeId" TEXT,
    "demandLetterDate" TIMESTAMP(3),
    "demandDeadline" TIMESTAMP(3),
    "criminalComplaintStatus" "CriminalComplaintStatus" NOT NULL DEFAULT 'NOT_REPORTED',
    "comments" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequeInvoice" (
    "chequeId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ChequeInvoice_pkey" PRIMARY KEY ("chequeId","invoiceId")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT,
    "interviewDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "interviewers" TEXT NOT NULL,
    "personsPresent" TEXT,
    "interviewType" "InterviewType" NOT NULL,
    "questionsCovered" TEXT,
    "summaryOfResponses" TEXT,
    "admissions" TEXT,
    "contradictions" TEXT,
    "documentsShown" TEXT,
    "followUpQuestions" TEXT,
    "signedStatementId" TEXT,
    "conclusion" TEXT,
    "nextAction" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyStatement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT,
    "kind" "StatementKind" NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "evidenceId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PartyStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "investigatorId" TEXT NOT NULL,
    "workPerformed" TEXT NOT NULL,
    "personContacted" TEXT,
    "documentsReviewed" TEXT,
    "evidenceObtained" TEXT,
    "outcome" TEXT,
    "findings" TEXT,
    "amountVerified" DECIMAL(18,2),
    "amountRecovered" DECIMAL(18,2),
    "challenges" TEXT,
    "nextTask" TEXT,
    "responsibleOfficerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "status" "WorkLogStatus" NOT NULL DEFAULT 'OPEN',
    "supervisorReview" TEXT,
    "supervisorStatus" "SupervisorReviewStatus" NOT NULL DEFAULT 'PENDING',
    "supervisorId" TEXT,
    "supervisorReviewedAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "externalParty" TEXT,
    "sourceWorkLogId" TEXT,
    "completedAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "scanStatus" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" "EvidenceCategory" NOT NULL,
    "source" TEXT,
    "provider" TEXT,
    "dateReceived" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "originalFileId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'CONFIDENTIAL',
    "notes" TEXT,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "linkType" TEXT,
    "linkId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceVersion" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAccess" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "EvidenceAccessAction" NOT NULL,
    "detail" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromHolder" TEXT,
    "toHolder" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "title" TEXT NOT NULL,
    "allegations" TEXT NOT NULL,
    "scopeCompleted" TEXT,
    "documentsReviewed" TEXT,
    "interviewsCompleted" TEXT,
    "financialAnalysis" TEXT,
    "factsEstablished" TEXT,
    "factsNotEstablished" TEXT,
    "controlFailures" TEXT,
    "confirmedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "disputedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recoveredAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unresolvedIssues" TEXT,
    "evidenceSufficiency" "EvidenceSufficiency" NOT NULL DEFAULT 'PARTLY_SUFFICIENT',
    "investigatorConclusion" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "details" TEXT,
    "approved" BOOLEAN,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementDecision" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "approverId" TEXT NOT NULL,
    "decisionDate" TIMESTAMP(3) NOT NULL,
    "conditions" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriminalMatter" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "dateReported" TIMESTAMP(3),
    "policeStation" TEXT NOT NULL,
    "county" TEXT,
    "town" TEXT,
    "obNumber" TEXT,
    "policeReference" TEXT,
    "investigatingOfficer" TEXT,
    "officerRank" TEXT,
    "officerTelephone" TEXT,
    "officerEmail" TEXT,
    "documentsHandedOver" TEXT,
    "internalOfficerId" TEXT,
    "status" "CriminalStatus" NOT NULL DEFAULT 'PREPARING',
    "courtCaseNumber" TEXT,
    "court" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CriminalMatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriminalMilestone" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "milestone" "CriminalMilestoneType" NOT NULL,
    "milestoneDate" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT,
    "notes" TEXT,
    "nextDate" TIMESTAMP(3),
    "nextTask" TEXT,
    "responsibleParty" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CriminalMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CivilMatter" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "referralDate" TIMESTAMP(3),
    "legalFirm" TEXT NOT NULL,
    "advocate" TEXT NOT NULL,
    "advocateContacts" TEXT,
    "internalLegalOfficerId" TEXT,
    "demandLetterDate" TIMESTAMP(3),
    "amountDemanded" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debtorResponse" TEXT,
    "approvalToSue" BOOLEAN NOT NULL DEFAULT false,
    "approvalToSueDate" TIMESTAMP(3),
    "filingDate" TIMESTAMP(3),
    "court" TEXT,
    "courtStation" TEXT,
    "courtCaseNumber" TEXT,
    "plaintiff" TEXT,
    "defendant" TEXT,
    "amountClaimed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "securityOrGuarantee" TEXT,
    "status" "CivilStatus" NOT NULL DEFAULT 'REFERRED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CivilMatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtEvent" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "eventType" "CourtEventType" NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT,
    "orders" TEXT,
    "nextCourtDate" TIMESTAMP(3),
    "nextTask" TEXT,
    "responsibleParty" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CourtEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryCase" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "hrReferralDate" TIMESTAMP(3),
    "applicablePolicy" TEXT,
    "showCauseDate" TIMESTAMP(3),
    "employeeResponse" TEXT,
    "hearingDate" TIMESTAMP(3),
    "decision" TEXT,
    "decisionDate" TIMESTAMP(3),
    "recoveryOrdered" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "appeal" TEXT,
    "finalOutcome" TEXT,
    "status" "DisciplinaryStatus" NOT NULL DEFAULT 'HR_REFERRAL',
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "DisciplinaryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriteOff" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "recoveryActionsAttempted" TEXT,
    "legalOpinion" TEXT,
    "financeReviewById" TEXT,
    "financeReviewAt" TIMESTAMP(3),
    "financeReviewNotes" TEXT,
    "managementApprovalById" TEXT,
    "managementApprovalAt" TIMESTAMP(3),
    "boardApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "boardApprovalReference" TEXT,
    "boardApprovalDate" TIMESTAMP(3),
    "accountingEntryReference" TEXT,
    "continuingRecovery" BOOLEAN NOT NULL DEFAULT false,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'DRAFT',
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WriteOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "workLogId" TEXT,
    "advanceId" TEXT,
    "stage" "InvestigationStage",
    "pathway" "CostPathway" NOT NULL DEFAULT 'INVESTIGATION',
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "employeeId" TEXT,
    "payee" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "amountBeforeTax" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rejectedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costCentre" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalComment" TEXT,
    "paymentReference" TEXT,
    "recoverability" "Recoverability" NOT NULL DEFAULT 'UNDER_REVIEW',
    "notes" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountRequested" DECIMAL(18,2) NOT NULL,
    "amountApproved" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountIssued" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountReturned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "accountingDeadline" TIMESTAMP(3),
    "accountingDate" TIMESTAMP(3),
    "status" "AdvanceStatus" NOT NULL DEFAULT 'REQUESTED',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "pathway" "CostPathway" NOT NULL,
    "approvedAmount" DECIMAL(18,2) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'PROPOSED',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recovery" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "recoveryDate" TIMESTAMP(3) NOT NULL,
    "payer" TEXT NOT NULL,
    "invoiceId" TEXT,
    "chequeId" TEXT,
    "civilMatterId" TEXT,
    "method" "RecoveryMethod" NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "recoveryCosts" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "receivingAccount" TEXT,
    "receiptNumber" TEXT,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "remainingBalance" DECIMAL(18,2),
    "notes" TEXT,
    "importBatchId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Recovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subFileId" TEXT,
    "ownerName" TEXT NOT NULL,
    "relatedPartyId" TEXT,
    "institutionType" "InstitutionType" NOT NULL,
    "institution" TEXT NOT NULL,
    "accountType" TEXT,
    "maskedAccount" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "source" TEXT,
    "dateReceived" TIMESTAMP(3),
    "processingAuthority" TEXT NOT NULL,
    "format" "StatementFormat" NOT NULL,
    "originalFileId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'UPLOADED',
    "parserUsed" TEXT,
    "parseMessage" TEXT,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "analysedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "deletionBatchId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restorationReason" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementTransaction" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "txnTime" TEXT,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2),
    "counterpartyName" TEXT,
    "counterpartyPhone" TEXT,
    "counterpartyAccount" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StatementTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLink" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "targetType" "LinkTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "linkClass" "LinkClass" NOT NULL,
    "score" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownAccount" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT,
    "holderName" TEXT NOT NULL,
    "institution" TEXT,
    "accountRef" TEXT,
    "telephone" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "caseId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "duplicateStrategy" "DuplicateStrategy" NOT NULL,
    "mapping" JSONB NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duplicateOfId" TEXT,
    "resultId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkActionBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "action" "BulkActionType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "reason" TEXT,
    "parameters" JSONB,
    "recordIds" TEXT[],
    "affectedCount" INTEGER NOT NULL,
    "skipped" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,

    CONSTRAINT "BulkActionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityIds" TEXT[],
    "reason" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requesterReauthAt" TIMESTAMP(3) NOT NULL,
    "approverId" TEXT,
    "approverReauthAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "caseId" TEXT,
    "reportType" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filters" JSONB,
    "rowCount" INTEGER NOT NULL,
    "fileId" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "caseId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "details" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalIdentityId_key" ON "User"("externalIdentityId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserScope_userId_companyId_branchId_key" ON "UserScope"("userId", "companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_reference_key" ON "Case"("reference");

-- CreateIndex
CREATE INDEX "Case_status_isDeleted_idx" ON "Case"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "Case_companyId_branchId_idx" ON "Case"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Case_leadInvestigatorId_idx" ON "Case"("leadInvestigatorId");

-- CreateIndex
CREATE INDEX "Case_priority_idx" ON "Case"("priority");

-- CreateIndex
CREATE INDEX "Case_openedAt_idx" ON "Case"("openedAt");

-- CreateIndex
CREATE INDEX "Case_lastActivityAt_idx" ON "Case"("lastActivityAt");

-- CreateIndex
CREATE INDEX "CaseAssignment_userId_active_idx" ON "CaseAssignment"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAssignment_caseId_userId_role_key" ON "CaseAssignment"("caseId", "userId", "role");

-- CreateIndex
CREATE INDEX "CaseStatusHistory_caseId_changedAt_idx" ON "CaseStatusHistory"("caseId", "changedAt");

-- CreateIndex
CREATE INDEX "CaseClosure_caseId_idx" ON "CaseClosure"("caseId");

-- CreateIndex
CREATE INDEX "CaseReopening_caseId_idx" ON "CaseReopening"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "SubFile_reference_key" ON "SubFile"("reference");

-- CreateIndex
CREATE INDEX "SubFile_caseId_isDeleted_idx" ON "SubFile"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "SubFile_caseId_sequence_key" ON "SubFile"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "Party_caseId_isDeleted_idx" ON "Party"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Party_name_idx" ON "Party"("name");

-- CreateIndex
CREATE INDEX "Party_telephone_idx" ON "Party"("telephone");

-- CreateIndex
CREATE INDEX "Invoice_caseId_isDeleted_idx" ON "Invoice"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_customerName_idx" ON "Invoice"("customerName");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_replacementChequeId_key" ON "Cheque"("replacementChequeId");

-- CreateIndex
CREATE INDEX "Cheque_caseId_isDeleted_idx" ON "Cheque"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Cheque_chequeNumber_idx" ON "Cheque"("chequeNumber");

-- CreateIndex
CREATE INDEX "Cheque_status_idx" ON "Cheque"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_signedStatementId_key" ON "Interview"("signedStatementId");

-- CreateIndex
CREATE INDEX "Interview_caseId_isDeleted_idx" ON "Interview"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "PartyStatement_evidenceId_key" ON "PartyStatement"("evidenceId");

-- CreateIndex
CREATE INDEX "PartyStatement_caseId_isDeleted_idx" ON "PartyStatement"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "WorkLog_caseId_occurredAt_idx" ON "WorkLog"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkLog_caseId_isDeleted_idx" ON "WorkLog"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Task_reference_key" ON "Task"("reference");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_caseId_status_idx" ON "Task"("caseId", "status");

-- CreateIndex
CREATE INDEX "Task_caseId_isDeleted_idx" ON "Task"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_sha256_idx" ON "StoredFile"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_reference_key" ON "Evidence"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_originalFileId_key" ON "Evidence"("originalFileId");

-- CreateIndex
CREATE INDEX "Evidence_sha256_idx" ON "Evidence"("sha256");

-- CreateIndex
CREATE INDEX "Evidence_linkType_linkId_idx" ON "Evidence"("linkType", "linkId");

-- CreateIndex
CREATE INDEX "Evidence_caseId_isDeleted_idx" ON "Evidence"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_caseId_sequence_key" ON "Evidence"("caseId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceVersion_fileId_key" ON "EvidenceVersion"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceVersion_evidenceId_version_key" ON "EvidenceVersion"("evidenceId", "version");

-- CreateIndex
CREATE INDEX "EvidenceAccess_evidenceId_createdAt_idx" ON "EvidenceAccess"("evidenceId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceAccess_userId_createdAt_idx" ON "EvidenceAccess"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CustodyEvent_evidenceId_idx" ON "CustodyEvent"("evidenceId");

-- CreateIndex
CREATE INDEX "Finding_caseId_isDeleted_idx" ON "Finding"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_findingId_type_key" ON "Recommendation"("findingId", "type");

-- CreateIndex
CREATE INDEX "ManagementDecision_findingId_idx" ON "ManagementDecision"("findingId");

-- CreateIndex
CREATE INDEX "CriminalMatter_caseId_isDeleted_idx" ON "CriminalMatter"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "CriminalMatter_obNumber_idx" ON "CriminalMatter"("obNumber");

-- CreateIndex
CREATE INDEX "CriminalMatter_policeStation_idx" ON "CriminalMatter"("policeStation");

-- CreateIndex
CREATE INDEX "CriminalMilestone_matterId_milestoneDate_idx" ON "CriminalMilestone"("matterId", "milestoneDate");

-- CreateIndex
CREATE INDEX "CriminalMilestone_nextDate_idx" ON "CriminalMilestone"("nextDate");

-- CreateIndex
CREATE INDEX "CivilMatter_caseId_isDeleted_idx" ON "CivilMatter"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "CivilMatter_courtCaseNumber_idx" ON "CivilMatter"("courtCaseNumber");

-- CreateIndex
CREATE INDEX "CivilMatter_advocate_idx" ON "CivilMatter"("advocate");

-- CreateIndex
CREATE INDEX "CourtEvent_matterId_eventDate_idx" ON "CourtEvent"("matterId", "eventDate");

-- CreateIndex
CREATE INDEX "CourtEvent_nextCourtDate_idx" ON "CourtEvent"("nextCourtDate");

-- CreateIndex
CREATE INDEX "DisciplinaryCase_caseId_isDeleted_idx" ON "DisciplinaryCase"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "WriteOff_reference_key" ON "WriteOff"("reference");

-- CreateIndex
CREATE INDEX "WriteOff_caseId_isDeleted_idx" ON "WriteOff"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE INDEX "Expense_caseId_status_idx" ON "Expense"("caseId", "status");

-- CreateIndex
CREATE INDEX "Expense_caseId_isDeleted_idx" ON "Expense"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Advance_reference_key" ON "Advance"("reference");

-- CreateIndex
CREATE INDEX "Advance_caseId_isDeleted_idx" ON "Advance"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Advance_status_accountingDeadline_idx" ON "Advance"("status", "accountingDeadline");

-- CreateIndex
CREATE INDEX "Budget_caseId_isDeleted_idx" ON "Budget"("caseId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Recovery_reference_key" ON "Recovery"("reference");

-- CreateIndex
CREATE INDEX "Recovery_caseId_status_idx" ON "Recovery"("caseId", "status");

-- CreateIndex
CREATE INDEX "Recovery_caseId_isDeleted_idx" ON "Recovery"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Recovery_recoveryDate_idx" ON "Recovery"("recoveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_reference_key" ON "FinancialStatement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_originalFileId_key" ON "FinancialStatement"("originalFileId");

-- CreateIndex
CREATE INDEX "FinancialStatement_caseId_isDeleted_idx" ON "FinancialStatement"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "StatementTransaction_statementId_txnDate_idx" ON "StatementTransaction"("statementId", "txnDate");

-- CreateIndex
CREATE INDEX "StatementTransaction_reference_idx" ON "StatementTransaction"("reference");

-- CreateIndex
CREATE INDEX "StatementTransaction_counterpartyPhone_idx" ON "StatementTransaction"("counterpartyPhone");

-- CreateIndex
CREATE INDEX "StatementTransaction_counterpartyAccount_idx" ON "StatementTransaction"("counterpartyAccount");

-- CreateIndex
CREATE UNIQUE INDEX "StatementTransaction_statementId_rowNumber_key" ON "StatementTransaction"("statementId", "rowNumber");

-- CreateIndex
CREATE INDEX "TransactionLink_status_idx" ON "TransactionLink"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionLink_transactionId_targetType_targetId_key" ON "TransactionLink"("transactionId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "KnownAccount_caseId_idx" ON "KnownAccount"("caseId");

-- CreateIndex
CREATE INDEX "KnownAccount_telephone_idx" ON "KnownAccount"("telephone");

-- CreateIndex
CREATE INDEX "KnownAccount_accountRef_idx" ON "KnownAccount"("accountRef");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_reference_key" ON "ImportBatch"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_idempotencyKey_key" ON "ImportBatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BulkActionBatch_reference_key" ON "BulkActionBatch"("reference");

-- CreateIndex
CREATE INDEX "BulkActionBatch_createdAt_idx" ON "BulkActionBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionRequest_reference_key" ON "DeletionRequest"("reference");

-- CreateIndex
CREATE INDEX "DeletionRequest_status_idx" ON "DeletionRequest"("status");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedReport_reference_key" ON "GeneratedReport"("reference");

-- CreateIndex
CREATE INDEX "GeneratedReport_createdAt_idx" ON "GeneratedReport"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_caseId_at_idx" ON "AuditLog"("caseId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "SecurityAlert_type_createdAt_idx" ON "SecurityAlert"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlert_acknowledgedAt_idx" ON "SecurityAlert"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_leadInvestigatorId_fkey" FOREIGN KEY ("leadInvestigatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_supervisingManagerId_fkey" FOREIGN KEY ("supervisingManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseClosure" ADD CONSTRAINT "CaseClosure_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReopening" ADD CONSTRAINT "CaseReopening_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubFile" ADD CONSTRAINT "SubFile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubFile" ADD CONSTRAINT "SubFile_investigatorId_fkey" FOREIGN KEY ("investigatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_replacementChequeId_fkey" FOREIGN KEY ("replacementChequeId") REFERENCES "Cheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeInvoice" ADD CONSTRAINT "ChequeInvoice_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeInvoice" ADD CONSTRAINT "ChequeInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_signedStatementId_fkey" FOREIGN KEY ("signedStatementId") REFERENCES "PartyStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyStatement" ADD CONSTRAINT "PartyStatement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyStatement" ADD CONSTRAINT "PartyStatement_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyStatement" ADD CONSTRAINT "PartyStatement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_investigatorId_fkey" FOREIGN KEY ("investigatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_responsibleOfficerId_fkey" FOREIGN KEY ("responsibleOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceWorkLogId_fkey" FOREIGN KEY ("sourceWorkLogId") REFERENCES "WorkLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceVersion" ADD CONSTRAINT "EvidenceVersion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAccess" ADD CONSTRAINT "EvidenceAccess_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAccess" ADD CONSTRAINT "EvidenceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementDecision" ADD CONSTRAINT "ManagementDecision_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriminalMatter" ADD CONSTRAINT "CriminalMatter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriminalMilestone" ADD CONSTRAINT "CriminalMilestone_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "CriminalMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CivilMatter" ADD CONSTRAINT "CivilMatter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtEvent" ADD CONSTRAINT "CourtEvent_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "CivilMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryCase" ADD CONSTRAINT "DisciplinaryCase_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteOff" ADD CONSTRAINT "WriteOff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteOff" ADD CONSTRAINT "WriteOff_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recovery" ADD CONSTRAINT "Recovery_civilMatterId_fkey" FOREIGN KEY ("civilMatterId") REFERENCES "CivilMatter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_subFileId_fkey" FOREIGN KEY ("subFileId") REFERENCES "SubFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_relatedPartyId_fkey" FOREIGN KEY ("relatedPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementTransaction" ADD CONSTRAINT "StatementTransaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FinancialStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLink" ADD CONSTRAINT "TransactionLink_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "StatementTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownAccount" ADD CONSTRAINT "KnownAccount_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownAccount" ADD CONSTRAINT "KnownAccount_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

