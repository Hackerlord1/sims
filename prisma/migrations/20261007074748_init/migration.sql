-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Company_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Branch_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Department_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `employeeNumber` VARCHAR(191) NULL,
    `telephone` VARCHAR(191) NULL,
    `jobTitle` VARCHAR(191) NULL,
    `role` ENUM('SYSTEM_ADMIN', 'LEAD_INVESTIGATOR', 'INVESTIGATOR', 'INTERNAL_AUDIT_REVIEWER', 'COMPLIANCE_REVIEWER', 'LEGAL_OFFICER', 'HR_OFFICER', 'FINANCE_REVIEWER', 'MANAGEMENT_APPROVER', 'EXECUTIVE_READ_ONLY', 'EXTERNAL_ADVOCATE_RESTRICTED') NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `clearance` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED') NOT NULL DEFAULT 'STANDARD',
    `companyId` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordChangedAt` DATETIME(3) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `externalIdentityId` VARCHAR(191) NULL,
    `mfaSecret` TEXT NULL,
    `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mfaPendingSecret` TEXT NULL,
    `mfaLastUsedStep` INTEGER NULL,
    `preferences` JSON NULL,
    `isDemoAdmin` BOOLEAN NOT NULL DEFAULT false,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `permissionDenials` JSON NOT NULL,
    `dataApprover` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_employeeNumber_key`(`employeeNumber`),
    UNIQUE INDEX `User_externalIdentityId_key`(`externalIdentityId`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserScope` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserScope_userId_companyId_branchId_key`(`userId`, `companyId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mfaVerified` BOOLEAN NOT NULL DEFAULT false,
    `reauthAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(300) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferenceCounter` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Case` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `businessUnit` VARCHAR(300) NULL,
    `branchId` VARCHAR(191) NULL,
    `location` VARCHAR(300) NULL,
    `category` ENUM('INVOICE_IRREGULARITY', 'BAD_CHEQUE', 'FINANCIAL_MISCONDUCT', 'CUSTOMER_DEBT', 'CASH_MISAPPROPRIATION', 'STOCK_LOSS', 'PROCUREMENT_FRAUD', 'PAYROLL_FRAUD', 'OTHER') NOT NULL,
    `description` MEDIUMTEXT NULL,
    `allegationSummary` MEDIUMTEXT NULL,
    `referralSource` VARCHAR(300) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `incidentDate` DATETIME(3) NULL,
    `incidentPeriodFrom` DATETIME(3) NULL,
    `incidentPeriodTo` DATETIME(3) NULL,
    `leadInvestigatorId` VARCHAR(191) NULL,
    `supervisingManagerId` VARCHAR(191) NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `confidentiality` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED') NOT NULL DEFAULT 'CONFIDENTIAL',
    `financialRisk` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('DRAFT', 'PRELIMINARY_REVIEW', 'UNDER_INTERNAL_INVESTIGATION', 'AWAITING_DOCUMENTS', 'AWAITING_INTERVIEW', 'AWAITING_MANAGEMENT_DECISION', 'REFERRED_FOR_CRIMINAL_ACTION', 'REFERRED_FOR_CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_PROCESS', 'WRITE_OFF_APPROVAL', 'RECOVERY_MONITORING', 'CLOSED', 'REOPENED') NOT NULL DEFAULT 'DRAFT',
    `stage` ENUM('INTAKE', 'PLANNING', 'EVIDENCE_GATHERING', 'INTERVIEWS', 'ANALYSIS', 'REPORTING', 'ACTION', 'MONITORING', 'CONCLUDED') NOT NULL DEFAULT 'INTAKE',
    `targetClosureDate` DATETIME(3) NULL,
    `actualClosureDate` DATETIME(3) NULL,
    `closureReason` VARCHAR(300) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'KES',
    `grossAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountDemanded` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountDisputed` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountAcknowledged` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountConfirmedRecoverable` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `legalHold` BOOLEAN NOT NULL DEFAULT false,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Case_reference_key`(`reference`),
    INDEX `Case_status_isDeleted_idx`(`status`, `isDeleted`),
    INDEX `Case_companyId_branchId_idx`(`companyId`, `branchId`),
    INDEX `Case_leadInvestigatorId_idx`(`leadInvestigatorId`),
    INDEX `Case_priority_idx`(`priority`),
    INDEX `Case_openedAt_idx`(`openedAt`),
    INDEX `Case_lastActivityAt_idx`(`lastActivityAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('LEAD', 'SUPPORTING', 'SUPERVISOR', 'REVIEWER', 'LEGAL', 'HR', 'FINANCE', 'EXTERNAL_ADVOCATE') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `CaseAssignment_userId_active_idx`(`userId`, `active`),
    UNIQUE INDEX `CaseAssignment_caseId_userId_role_key`(`caseId`, `userId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('DRAFT', 'PRELIMINARY_REVIEW', 'UNDER_INTERNAL_INVESTIGATION', 'AWAITING_DOCUMENTS', 'AWAITING_INTERVIEW', 'AWAITING_MANAGEMENT_DECISION', 'REFERRED_FOR_CRIMINAL_ACTION', 'REFERRED_FOR_CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_PROCESS', 'WRITE_OFF_APPROVAL', 'RECOVERY_MONITORING', 'CLOSED', 'REOPENED') NULL,
    `toStatus` ENUM('DRAFT', 'PRELIMINARY_REVIEW', 'UNDER_INTERNAL_INVESTIGATION', 'AWAITING_DOCUMENTS', 'AWAITING_INTERVIEW', 'AWAITING_MANAGEMENT_DECISION', 'REFERRED_FOR_CRIMINAL_ACTION', 'REFERRED_FOR_CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_PROCESS', 'WRITE_OFF_APPROVAL', 'RECOVERY_MONITORING', 'CLOSED', 'REOPENED') NOT NULL,
    `reason` TEXT NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseStatusHistory_caseId_changedAt_idx`(`caseId`, `changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseClosure` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `summary` MEDIUMTEXT NOT NULL,
    `checklist` JSON NOT NULL,
    `closedById` VARCHAR(191) NOT NULL,
    `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseClosure_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseReopening` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `newInformation` MEDIUMTEXT NOT NULL,
    `previousStatus` ENUM('DRAFT', 'PRELIMINARY_REVIEW', 'UNDER_INTERNAL_INVESTIGATION', 'AWAITING_DOCUMENTS', 'AWAITING_INTERVIEW', 'AWAITING_MANAGEMENT_DECISION', 'REFERRED_FOR_CRIMINAL_ACTION', 'REFERRED_FOR_CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_PROCESS', 'WRITE_OFF_APPROVAL', 'RECOVERY_MONITORING', 'CLOSED', 'REOPENED') NOT NULL,
    `reopenedById` VARCHAR(191) NOT NULL,
    `reopenedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseReopening_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubFile` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `location` VARCHAR(300) NULL,
    `allegation` MEDIUMTEXT NULL,
    `transactionType` VARCHAR(300) NULL,
    `periodFrom` DATETIME(3) NULL,
    `periodTo` DATETIME(3) NULL,
    `investigatorId` VARCHAR(191) NULL,
    `amountInvolved` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'COMPLETED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `findings` MEDIUMTEXT NULL,
    `recommendation` MEDIUMTEXT NULL,
    `targetDate` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `SubFile_reference_key`(`reference`),
    INDEX `SubFile_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    UNIQUE INDEX `SubFile_caseId_sequence_key`(`caseId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Party` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `role` ENUM('PERSON_OF_INTEREST', 'SUSPECT_REPORTED_TO_AUTHORITIES', 'WITNESS', 'EMPLOYEE', 'CUSTOMER', 'COMPLAINANT', 'GUARANTOR', 'POLICE_OR_DCI_OFFICER', 'ADVOCATE', 'OTHER_PARTY') NOT NULL,
    `kind` ENUM('INDIVIDUAL', 'ORGANISATION') NOT NULL DEFAULT 'INDIVIDUAL',
    `name` VARCHAR(300) NOT NULL,
    `idNumber` VARCHAR(300) NULL,
    `telephone` VARCHAR(300) NULL,
    `email` VARCHAR(254) NULL,
    `address` TEXT NULL,
    `organisation` VARCHAR(300) NULL,
    `employeeNumber` VARCHAR(300) NULL,
    `customerCode` VARCHAR(300) NULL,
    `relationshipToCase` VARCHAR(300) NULL,
    `accessClassification` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED') NOT NULL DEFAULT 'CONFIDENTIAL',
    `notes` MEDIUMTEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Party_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Party_name_idx`(`name`),
    INDEX `Party_telephone_idx`(`telephone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `invoiceNumber` VARCHAR(300) NOT NULL,
    `invoiceDate` DATETIME(3) NOT NULL,
    `customerName` VARCHAR(300) NOT NULL,
    `customerCode` VARCHAR(300) NULL,
    `salesLocation` VARCHAR(300) NULL,
    `deliveryLocation` VARCHAR(300) NULL,
    `invoiceAmount` DECIMAL(18, 2) NOT NULL,
    `amountPaid` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountDisputed` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountAcknowledged` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `salesRepresentative` VARCHAR(300) NULL,
    `deliveryPerson` VARCHAR(300) NULL,
    `vehicleReference` VARCHAR(300) NULL,
    `deliveryNoteNumber` VARCHAR(300) NULL,
    `proofOfDelivery` ENUM('AVAILABLE', 'MISSING', 'PARTIAL', 'DISPUTED', 'NOT_REQUIRED') NOT NULL DEFAULT 'MISSING',
    `erpPostingStatus` ENUM('POSTED', 'NOT_POSTED', 'REVERSED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `customerVerification` ENUM('NOT_CONTACTED', 'CONFIRMED', 'PARTLY_CONFIRMED', 'DISPUTED', 'CUSTOMER_NOT_FOUND') NOT NULL DEFAULT 'NOT_CONTACTED',
    `classification` ENUM('VALID_AND_SUPPORTED', 'VALID_BUT_UNPAID', 'DISPUTED', 'CUSTOMER_NOT_IDENTIFIED', 'NO_PROOF_OF_DELIVERY', 'DUPLICATE', 'PRESALE_INVOICE', 'FICTITIOUS_INVOICE_SUSPECTED', 'RAISED_UNDER_MANAGEMENT_INSTRUCTION', 'PAYMENT_MADE_TO_EMPLOYEE', 'CASH_COLLECTED_NOT_REMITTED', 'MPESA_PAID_TO_PERSONAL_NUMBER', 'PARTLY_PAID', 'REQUIRES_FURTHER_INVESTIGATION', 'CLEARED') NOT NULL DEFAULT 'REQUIRES_FURTHER_INVESTIGATION',
    `observations` MEDIUMTEXT NULL,
    `responsiblePerson` VARCHAR(300) NULL,
    `recoveryStatus` ENUM('NOT_STARTED', 'IN_PROGRESS', 'PARTLY_RECOVERED', 'RECOVERED', 'WRITTEN_OFF', 'NOT_RECOVERABLE') NOT NULL DEFAULT 'NOT_STARTED',
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Invoice_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Invoice_invoiceNumber_idx`(`invoiceNumber`),
    INDEX `Invoice_customerName_idx`(`customerName`),
    INDEX `Invoice_invoiceDate_idx`(`invoiceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cheque` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `chequeNumber` VARCHAR(300) NOT NULL,
    `bank` VARCHAR(300) NOT NULL,
    `bankBranch` VARCHAR(300) NULL,
    `accountNumberMasked` VARCHAR(300) NULL,
    `accountName` VARCHAR(300) NULL,
    `chequeDate` DATETIME(3) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `dateReceived` DATETIME(3) NULL,
    `dateDeposited` DATETIME(3) NULL,
    `dateDishonoured` DATETIME(3) NULL,
    `dishonourReason` VARCHAR(300) NULL,
    `bankReturnReference` VARCHAR(300) NULL,
    `issuer` VARCHAR(300) NOT NULL,
    `receivedByEmployee` VARCHAR(300) NULL,
    `status` ENUM('RECEIVED', 'DEPOSITED', 'CLEARED', 'DISHONOURED', 'REPLACED', 'RECOVERED', 'WRITTEN_OFF') NOT NULL DEFAULT 'RECEIVED',
    `replacementChequeId` VARCHAR(191) NULL,
    `demandLetterDate` DATETIME(3) NULL,
    `demandDeadline` DATETIME(3) NULL,
    `criminalComplaintStatus` ENUM('NOT_REPORTED', 'REPORTED', 'UNDER_INVESTIGATION', 'CHARGED', 'CONCLUDED', 'NOT_PURSUED') NOT NULL DEFAULT 'NOT_REPORTED',
    `comments` MEDIUMTEXT NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Cheque_replacementChequeId_key`(`replacementChequeId`),
    INDEX `Cheque_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Cheque_chequeNumber_idx`(`chequeNumber`),
    INDEX `Cheque_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChequeInvoice` (
    `chequeId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,

    PRIMARY KEY (`chequeId`, `invoiceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interview` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `partyId` VARCHAR(191) NULL,
    `interviewDate` DATETIME(3) NOT NULL,
    `location` VARCHAR(300) NULL,
    `interviewers` VARCHAR(300) NOT NULL,
    `personsPresent` TEXT NULL,
    `interviewType` ENUM('FACT_FINDING', 'PERSON_OF_INTEREST', 'WITNESS', 'CUSTOMER_VERIFICATION', 'FOLLOW_UP', 'EXIT') NOT NULL,
    `questionsCovered` MEDIUMTEXT NULL,
    `summaryOfResponses` MEDIUMTEXT NULL,
    `admissions` MEDIUMTEXT NULL,
    `contradictions` MEDIUMTEXT NULL,
    `documentsShown` MEDIUMTEXT NULL,
    `followUpQuestions` MEDIUMTEXT NULL,
    `signedStatementId` VARCHAR(191) NULL,
    `conclusion` MEDIUMTEXT NULL,
    `nextAction` VARCHAR(300) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Interview_signedStatementId_key`(`signedStatementId`),
    INDEX `Interview_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartyStatement` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `partyId` VARCHAR(191) NULL,
    `kind` ENUM('WITNESS_STATEMENT', 'EMPLOYEE_EXPLANATION', 'CUSTOMER_CONFIRMATION', 'POLICE_STATEMENT', 'AFFIDAVIT', 'OTHER') NOT NULL,
    `statementDate` DATETIME(3) NOT NULL,
    `recordedBy` VARCHAR(300) NOT NULL,
    `summary` MEDIUMTEXT NOT NULL,
    `signed` BOOLEAN NOT NULL DEFAULT false,
    `evidenceId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PartyStatement_evidenceId_key`(`evidenceId`),
    INDEX `PartyStatement_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkLog` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `location` VARCHAR(300) NULL,
    `investigatorId` VARCHAR(191) NOT NULL,
    `workPerformed` MEDIUMTEXT NOT NULL,
    `personContacted` VARCHAR(300) NULL,
    `documentsReviewed` MEDIUMTEXT NULL,
    `evidenceObtained` MEDIUMTEXT NULL,
    `outcome` MEDIUMTEXT NULL,
    `findings` MEDIUMTEXT NULL,
    `amountVerified` DECIMAL(18, 2) NULL,
    `amountRecovered` DECIMAL(18, 2) NULL,
    `challenges` MEDIUMTEXT NULL,
    `nextTask` VARCHAR(300) NULL,
    `responsibleOfficerId` VARCHAR(191) NULL,
    `dueDate` DATETIME(3) NULL,
    `completionDate` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'OPEN',
    `supervisorReview` MEDIUMTEXT NULL,
    `supervisorStatus` ENUM('PENDING', 'REVIEWED', 'RETURNED') NOT NULL DEFAULT 'PENDING',
    `supervisorId` VARCHAR(191) NULL,
    `supervisorReviewedAt` DATETIME(3) NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `WorkLog_caseId_occurredAt_idx`(`caseId`, `occurredAt`),
    INDEX `WorkLog_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `title` VARCHAR(300) NOT NULL,
    `description` MEDIUMTEXT NULL,
    `category` ENUM('GENERAL', 'DOCUMENT_REQUEST', 'INTERVIEW', 'COURT_DATE', 'MANAGEMENT_APPROVAL', 'POLICE_FOLLOW_UP', 'DCI_FOLLOW_UP', 'DPP_FOLLOW_UP', 'ADVOCATE_FOLLOW_UP', 'DEMAND_FOLLOW_UP', 'RECOVERY_FOLLOW_UP') NOT NULL DEFAULT 'GENERAL',
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'WAITING_FOR_INTERNAL_PARTY', 'WAITING_FOR_EXTERNAL_PARTY', 'COMPLETED', 'CANCELLED', 'OVERDUE') NOT NULL DEFAULT 'NOT_STARTED',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `assigneeId` VARCHAR(191) NULL,
    `dueDate` DATETIME(3) NULL,
    `externalParty` VARCHAR(300) NULL,
    `linkType` VARCHAR(300) NULL,
    `linkId` VARCHAR(300) NULL,
    `sourceWorkLogId` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Task_reference_key`(`reference`),
    INDEX `Task_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `Task_dueDate_idx`(`dueDate`),
    INDEX `Task_caseId_status_idx`(`caseId`, `status`),
    INDEX `Task_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Task_linkType_linkId_idx`(`linkType`, `linkId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoredFile` (
    `id` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `originalName` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `readOnly` BOOLEAN NOT NULL DEFAULT true,
    `scanStatus` VARCHAR(191) NOT NULL DEFAULT 'NOT_SCANNED',
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoredFile_storageKey_key`(`storageKey`),
    INDEX `StoredFile_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Evidence` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `sequence` INTEGER NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `category` ENUM('DOCUMENT', 'INVOICE_COPY', 'DELIVERY_NOTE', 'CHEQUE_IMAGE', 'BANK_RETURN_MEMO', 'SIGNED_STATEMENT', 'IDENTIFICATION_DOCUMENT', 'FINANCIAL_STATEMENT', 'PHOTOGRAPH', 'AUDIO', 'VIDEO', 'EMAIL_OR_MESSAGE', 'COURT_ORDER', 'JUDGMENT', 'RECEIPT', 'REPORT', 'OTHER') NOT NULL,
    `source` VARCHAR(300) NULL,
    `provider` VARCHAR(300) NULL,
    `dateReceived` DATETIME(3) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `originalFileId` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(300) NOT NULL,
    `originalFilename` VARCHAR(300) NOT NULL,
    `confidentiality` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED') NOT NULL DEFAULT 'CONFIDENTIAL',
    `notes` MEDIUMTEXT NULL,
    `legalHold` BOOLEAN NOT NULL DEFAULT false,
    `linkType` VARCHAR(300) NULL,
    `linkId` VARCHAR(300) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Evidence_reference_key`(`reference`),
    UNIQUE INDEX `Evidence_originalFileId_key`(`originalFileId`),
    INDEX `Evidence_sha256_idx`(`sha256`),
    INDEX `Evidence_linkType_linkId_idx`(`linkType`, `linkId`),
    INDEX `Evidence_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    UNIQUE INDEX `Evidence_caseId_sequence_key`(`caseId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceVersion` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EvidenceVersion_fileId_key`(`fileId`),
    UNIQUE INDEX `EvidenceVersion_evidenceId_version_key`(`evidenceId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceAccess` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` ENUM('UPLOAD', 'VIEW', 'PREVIEW', 'DOWNLOAD', 'NEW_WORKING_VERSION', 'HASH_VERIFIED', 'HASH_MISMATCH', 'LEGAL_HOLD_ON', 'LEGAL_HOLD_OFF', 'METADATA_EDIT') NOT NULL,
    `detail` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EvidenceAccess_evidenceId_createdAt_idx`(`evidenceId`, `createdAt`),
    INDEX `EvidenceAccess_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustodyEvent` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `fromHolder` TEXT NULL,
    `toHolder` TEXT NOT NULL,
    `purpose` TEXT NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `recordedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustodyEvent_evidenceId_idx`(`evidenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Finding` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `title` VARCHAR(300) NOT NULL,
    `allegations` MEDIUMTEXT NOT NULL,
    `scopeCompleted` MEDIUMTEXT NULL,
    `documentsReviewed` MEDIUMTEXT NULL,
    `interviewsCompleted` MEDIUMTEXT NULL,
    `financialAnalysis` MEDIUMTEXT NULL,
    `factsEstablished` MEDIUMTEXT NULL,
    `factsNotEstablished` MEDIUMTEXT NULL,
    `controlFailures` MEDIUMTEXT NULL,
    `confirmedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `disputedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `recoveredAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `unresolvedIssues` MEDIUMTEXT NULL,
    `evidenceSufficiency` ENUM('SUFFICIENT', 'PARTLY_SUFFICIENT', 'INSUFFICIENT') NOT NULL DEFAULT 'PARTLY_SUFFICIENT',
    `investigatorConclusion` MEDIUMTEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'RETURNED', 'DECIDED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Finding_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recommendation` (
    `id` VARCHAR(191) NOT NULL,
    `findingId` VARCHAR(191) NOT NULL,
    `type` ENUM('NO_FURTHER_ACTION', 'ADDITIONAL_INVESTIGATION', 'CRIMINAL_ACTION', 'CIVIL_ACTION', 'CRIMINAL_AND_CIVIL_ACTION', 'DISCIPLINARY_OR_ADMINISTRATIVE_ACTION', 'INSURANCE_CLAIM', 'DEBT_RECOVERY_ARRANGEMENT', 'WRITE_OFF', 'CONTROL_IMPROVEMENT', 'EMPLOYEE_TRAINING', 'REFERRAL_TO_ANOTHER_AUTHORITY') NOT NULL,
    `details` TEXT NULL,
    `approved` BOOLEAN NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Recommendation_findingId_type_key`(`findingId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ManagementDecision` (
    `id` VARCHAR(191) NOT NULL,
    `findingId` VARCHAR(191) NOT NULL,
    `outcome` ENUM('APPROVED', 'APPROVED_WITH_CONDITIONS', 'RETURNED_FOR_MORE_WORK', 'REJECTED') NOT NULL,
    `approverId` VARCHAR(191) NOT NULL,
    `decisionDate` DATETIME(3) NOT NULL,
    `conditions` TEXT NULL,
    `comments` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ManagementDecision_findingId_idx`(`findingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CriminalMatter` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `dateReported` DATETIME(3) NULL,
    `policeStation` VARCHAR(300) NOT NULL,
    `county` VARCHAR(300) NULL,
    `town` VARCHAR(300) NULL,
    `obNumber` VARCHAR(300) NULL,
    `policeReference` VARCHAR(300) NULL,
    `investigatingOfficer` VARCHAR(300) NULL,
    `officerRank` VARCHAR(300) NULL,
    `officerTelephone` VARCHAR(300) NULL,
    `officerEmail` VARCHAR(254) NULL,
    `documentsHandedOver` MEDIUMTEXT NULL,
    `internalOfficerId` VARCHAR(191) NULL,
    `status` ENUM('PREPARING', 'REPORTED', 'UNDER_POLICE_INVESTIGATION', 'WITH_DPP', 'CHARGED', 'IN_COURT', 'CONCLUDED', 'WITHDRAWN', 'CLOSED') NOT NULL DEFAULT 'PREPARING',
    `courtCaseNumber` VARCHAR(300) NULL,
    `court` VARCHAR(300) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `CriminalMatter_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `CriminalMatter_obNumber_idx`(`obNumber`),
    INDEX `CriminalMatter_policeStation_idx`(`policeStation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CriminalMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `matterId` VARCHAR(191) NOT NULL,
    `milestone` ENUM('COMPLAINT_RECORDED', 'OB_NUMBER_OBTAINED', 'STATEMENTS_RECORDED', 'SUSPECT_INTERVIEWED', 'AFFIDAVIT_PREPARED', 'FINANCIAL_INSTITUTION_SERVED', 'BANK_RESPONSE_RECEIVED', 'MPESA_RESPONSE_RECEIVED', 'FORENSIC_ANALYSIS_COMPLETED', 'FILE_FORWARDED_TO_DPP', 'DPP_DIRECTIONS_RECEIVED', 'FURTHER_INVESTIGATION_REQUESTED', 'DECISION_TO_CHARGE', 'WARRANT_ISSUED', 'ARREST_COMPLETED', 'BOND_OR_BAIL', 'PLEA_TAKEN', 'TRIAL', 'JUDGMENT', 'CLOSURE') NOT NULL,
    `milestoneDate` DATETIME(3) NOT NULL,
    `outcome` VARCHAR(300) NULL,
    `notes` MEDIUMTEXT NULL,
    `nextDate` DATETIME(3) NULL,
    `nextTask` VARCHAR(300) NULL,
    `responsibleParty` VARCHAR(300) NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `CriminalMilestone_matterId_milestoneDate_idx`(`matterId`, `milestoneDate`),
    INDEX `CriminalMilestone_nextDate_idx`(`nextDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CivilMatter` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `referralDate` DATETIME(3) NULL,
    `legalFirm` VARCHAR(300) NOT NULL,
    `advocate` VARCHAR(300) NOT NULL,
    `advocateContacts` VARCHAR(300) NULL,
    `internalLegalOfficerId` VARCHAR(191) NULL,
    `demandLetterDate` DATETIME(3) NULL,
    `amountDemanded` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `debtorResponse` MEDIUMTEXT NULL,
    `approvalToSue` BOOLEAN NOT NULL DEFAULT false,
    `approvalToSueDate` DATETIME(3) NULL,
    `filingDate` DATETIME(3) NULL,
    `court` VARCHAR(300) NULL,
    `courtStation` VARCHAR(300) NULL,
    `courtCaseNumber` VARCHAR(300) NULL,
    `plaintiff` VARCHAR(300) NULL,
    `defendant` VARCHAR(300) NULL,
    `amountClaimed` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `securityOrGuarantee` VARCHAR(300) NULL,
    `status` ENUM('REFERRED', 'DEMAND_ISSUED', 'NEGOTIATION', 'APPROVED_TO_SUE', 'FILED', 'IN_COURT', 'JUDGMENT_OBTAINED', 'EXECUTION', 'SETTLED', 'WITHDRAWN', 'CLOSED') NOT NULL DEFAULT 'REFERRED',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `CivilMatter_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `CivilMatter_courtCaseNumber_idx`(`courtCaseNumber`),
    INDEX `CivilMatter_advocate_idx`(`advocate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourtEvent` (
    `id` VARCHAR(191) NOT NULL,
    `matterId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('MENTION', 'HEARING', 'APPLICATION', 'RULING', 'MEDIATION', 'NEGOTIATION', 'CONSENT', 'JUDGMENT', 'DECREE', 'EXECUTION', 'GARNISHEE_PROCEEDINGS', 'AUCTION', 'PAYMENT_PLAN', 'APPEAL', 'CLOSURE') NOT NULL,
    `eventDate` DATETIME(3) NOT NULL,
    `outcome` MEDIUMTEXT NULL,
    `orders` MEDIUMTEXT NULL,
    `nextCourtDate` DATETIME(3) NULL,
    `nextTask` VARCHAR(300) NULL,
    `responsibleParty` VARCHAR(300) NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `CourtEvent_matterId_eventDate_idx`(`matterId`, `eventDate`),
    INDEX `CourtEvent_nextCourtDate_idx`(`nextCourtDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisciplinaryCase` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `employeeName` VARCHAR(300) NOT NULL,
    `employeeNumber` VARCHAR(300) NULL,
    `hrReferralDate` DATETIME(3) NULL,
    `applicablePolicy` VARCHAR(300) NULL,
    `showCauseDate` DATETIME(3) NULL,
    `employeeResponse` MEDIUMTEXT NULL,
    `hearingDate` DATETIME(3) NULL,
    `decision` MEDIUMTEXT NULL,
    `decisionDate` DATETIME(3) NULL,
    `recoveryOrdered` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `appeal` MEDIUMTEXT NULL,
    `finalOutcome` MEDIUMTEXT NULL,
    `status` ENUM('HR_REFERRAL', 'SHOW_CAUSE_ISSUED', 'RESPONSE_RECEIVED', 'HEARING_SCHEDULED', 'DECISION_MADE', 'UNDER_APPEAL', 'FINAL_OUTCOME', 'CLOSED') NOT NULL DEFAULT 'HR_REFERRAL',
    `closedAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `DisciplinaryCase_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WriteOff` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `reason` MEDIUMTEXT NOT NULL,
    `recoveryActionsAttempted` MEDIUMTEXT NULL,
    `legalOpinion` MEDIUMTEXT NULL,
    `financeReviewById` VARCHAR(191) NULL,
    `financeReviewAt` DATETIME(3) NULL,
    `financeReviewNotes` MEDIUMTEXT NULL,
    `managementApprovalById` VARCHAR(191) NULL,
    `managementApprovalAt` DATETIME(3) NULL,
    `boardApprovalRequired` BOOLEAN NOT NULL DEFAULT false,
    `boardApprovalReference` VARCHAR(300) NULL,
    `boardApprovalDate` DATETIME(3) NULL,
    `accountingEntryReference` VARCHAR(300) NULL,
    `continuingRecovery` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'FINANCE_REVIEW', 'MANAGEMENT_APPROVAL', 'BOARD_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `closedAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `WriteOff_reference_key`(`reference`),
    INDEX `WriteOff_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `workLogId` VARCHAR(191) NULL,
    `advanceId` VARCHAR(191) NULL,
    `stage` ENUM('INTAKE', 'PLANNING', 'EVIDENCE_GATHERING', 'INTERVIEWS', 'ANALYSIS', 'REPORTING', 'ACTION', 'MONITORING', 'CONCLUDED') NULL,
    `pathway` ENUM('INVESTIGATION', 'CRIMINAL', 'CIVIL', 'RECOVERY') NOT NULL DEFAULT 'INVESTIGATION',
    `category` ENUM('TRANSPORT', 'FUEL', 'MILEAGE', 'VEHICLE_HIRE', 'ACCOMMODATION', 'MEALS', 'SUBSISTENCE', 'FIELD_ALLOWANCE', 'AIRTIME', 'DATA', 'PRINTING', 'PHOTOCOPYING', 'COURIER', 'CERTIFICATION', 'INTERVIEW_COSTS', 'EXTERNAL_INVESTIGATOR', 'FORENSIC_ANALYSIS', 'BANK_STATEMENT_CHARGES', 'MPESA_STATEMENT_CHARGES', 'ADVOCATE_FEES', 'COURT_FILING_FEES', 'PROCESS_SERVER', 'WITNESS_COSTS', 'AUCTIONEER', 'ASSET_TRACING', 'VALUATION', 'RECOVERY_AGENT', 'OTHER_APPROVED_EXPENSE') NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `expenseDate` DATETIME(3) NOT NULL,
    `location` VARCHAR(300) NULL,
    `employeeId` VARCHAR(191) NULL,
    `payee` VARCHAR(300) NULL,
    `paymentMethod` ENUM('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CORPORATE_CARD', 'PETTY_CASH', 'IMPREST', 'OTHER') NOT NULL DEFAULT 'CASH',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'KES',
    `amountBeforeTax` DECIMAL(18, 2) NOT NULL,
    `tax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `requestedAmount` DECIMAL(18, 2) NOT NULL,
    `approvedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `rejectedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `costCentre` VARCHAR(300) NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'AWAITING_RECEIPT', 'ACCOUNTED_FOR', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `approverId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvalComment` TEXT NULL,
    `paymentReference` VARCHAR(300) NULL,
    `recoverability` ENUM('UNDER_REVIEW', 'RECOVERABLE', 'NOT_RECOVERABLE') NOT NULL DEFAULT 'UNDER_REVIEW',
    `notes` MEDIUMTEXT NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Expense_reference_key`(`reference`),
    INDEX `Expense_caseId_status_idx`(`caseId`, `status`),
    INDEX `Expense_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Expense_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Advance` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(300) NOT NULL,
    `amountRequested` DECIMAL(18, 2) NOT NULL,
    `amountApproved` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountIssued` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountReturned` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `issuedAt` DATETIME(3) NULL,
    `accountingDeadline` DATETIME(3) NULL,
    `accountingDate` DATETIME(3) NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED', 'PARTLY_ACCOUNTED', 'ACCOUNTED', 'CLOSED') NOT NULL DEFAULT 'REQUESTED',
    `approverId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `notes` MEDIUMTEXT NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Advance_reference_key`(`reference`),
    INDEX `Advance_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Advance_status_accountingDeadline_idx`(`status`, `accountingDeadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Budget` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `pathway` ENUM('INVESTIGATION', 'CRIMINAL', 'CIVIL', 'RECOVERY') NOT NULL,
    `approvedAmount` DECIMAL(18, 2) NOT NULL,
    `status` ENUM('PROPOSED', 'APPROVED', 'REVISED') NOT NULL DEFAULT 'PROPOSED',
    `approverId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `notes` MEDIUMTEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Budget_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recovery` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `recoveryDate` DATETIME(3) NOT NULL,
    `payer` VARCHAR(300) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `chequeId` VARCHAR(191) NULL,
    `civilMatterId` VARCHAR(191) NULL,
    `method` ENUM('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'SALARY_DEDUCTION', 'COURT_EXECUTION', 'GARNISHEE', 'AUCTION_PROCEEDS', 'INSURANCE', 'SET_OFF', 'OTHER') NOT NULL,
    `grossAmount` DECIMAL(18, 2) NOT NULL,
    `recoveryCosts` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `paymentReference` VARCHAR(300) NULL,
    `receivingAccount` VARCHAR(300) NULL,
    `receiptNumber` VARCHAR(300) NULL,
    `status` ENUM('RECORDED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'RECORDED',
    `recordedById` VARCHAR(191) NOT NULL,
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `remainingBalance` DECIMAL(18, 2) NULL,
    `notes` MEDIUMTEXT NULL,
    `importBatchId` VARCHAR(191) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Recovery_reference_key`(`reference`),
    INDEX `Recovery_caseId_status_idx`(`caseId`, `status`),
    INDEX `Recovery_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `Recovery_recoveryDate_idx`(`recoveryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialStatement` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(300) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `subFileId` VARCHAR(191) NULL,
    `ownerName` VARCHAR(300) NOT NULL,
    `relatedPartyId` VARCHAR(191) NULL,
    `institutionType` ENUM('BANK', 'MPESA', 'SACCO', 'OTHER') NOT NULL,
    `institution` VARCHAR(300) NOT NULL,
    `accountType` VARCHAR(300) NULL,
    `maskedAccount` VARCHAR(300) NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'KES',
    `source` VARCHAR(300) NULL,
    `dateReceived` DATETIME(3) NULL,
    `processingAuthority` VARCHAR(300) NOT NULL,
    `format` ENUM('PDF', 'SCANNED_PDF', 'CSV', 'XLSX', 'MPESA_PDF', 'BANK_PDF') NOT NULL,
    `originalFileId` VARCHAR(191) NOT NULL,
    `originalFilename` VARCHAR(300) NOT NULL,
    `sha256` VARCHAR(300) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADED', 'QUEUED', 'PARSING', 'PARSED', 'NEEDS_MANUAL_REVIEW', 'FAILED', 'REVIEWED') NOT NULL DEFAULT 'UPLOADED',
    `parserUsed` VARCHAR(191) NULL,
    `parseMessage` MEDIUMTEXT NULL,
    `transactionCount` INTEGER NOT NULL DEFAULT 0,
    `analysedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `FinancialStatement_reference_key`(`reference`),
    UNIQUE INDEX `FinancialStatement_originalFileId_key`(`originalFileId`),
    INDEX `FinancialStatement_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StatementTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `statementId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `txnDate` DATETIME(3) NOT NULL,
    `txnTime` VARCHAR(191) NULL,
    `reference` VARCHAR(300) NULL,
    `description` TEXT NOT NULL,
    `debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(18, 2) NULL,
    `counterpartyName` VARCHAR(300) NULL,
    `counterpartyPhone` VARCHAR(191) NULL,
    `counterpartyAccount` VARCHAR(191) NULL,
    `flags` JSON NOT NULL,
    `excluded` BOOLEAN NOT NULL DEFAULT false,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,

    INDEX `StatementTransaction_statementId_txnDate_idx`(`statementId`, `txnDate`),
    INDEX `StatementTransaction_reference_idx`(`reference`),
    INDEX `StatementTransaction_counterpartyPhone_idx`(`counterpartyPhone`),
    INDEX `StatementTransaction_counterpartyAccount_idx`(`counterpartyAccount`),
    UNIQUE INDEX `StatementTransaction_statementId_rowNumber_key`(`statementId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransactionLink` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('PARTY', 'STATEMENT_OWNER', 'INVOICE', 'CHEQUE', 'KNOWN_ACCOUNT') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `targetLabel` TEXT NOT NULL,
    `linkClass` ENUM('VERIFIED_DIRECT_MATCH', 'EXACT_REFERENCE_MATCH', 'PROBABLE_NAME_MATCH', 'TELEPHONE_NUMBER_MATCH', 'USER_CONFIRMED_MATCH', 'UNRESOLVED_POSSIBLE_MATCH') NOT NULL,
    `score` INTEGER NOT NULL,
    `rationale` TEXT NOT NULL,
    `status` ENUM('SUGGESTED', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'SUGGESTED',
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransactionLink_status_idx`(`status`),
    UNIQUE INDEX `TransactionLink_transactionId_targetType_targetId_key`(`transactionId`, `targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnownAccount` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `partyId` VARCHAR(191) NULL,
    `holderName` VARCHAR(300) NOT NULL,
    `institution` VARCHAR(300) NULL,
    `accountRef` VARCHAR(300) NULL,
    `telephone` VARCHAR(300) NULL,
    `notes` MEDIUMTEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `deletionReason` TEXT NULL,
    `deletionBatchId` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `restorationReason` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `KnownAccount_caseId_isDeleted_idx`(`caseId`, `isDeleted`),
    INDEX `KnownAccount_telephone_idx`(`telephone`),
    INDEX `KnownAccount_accountRef_idx`(`accountRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportBatch` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `fileName` TEXT NOT NULL,
    `fileSha256` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `mode` ENUM('ATOMIC', 'PARTIAL') NOT NULL,
    `duplicateStrategy` ENUM('SKIP', 'UPDATE_EXISTING', 'CREATE_NEW_VERSION', 'IMPORT_SEPARATELY', 'STOP_ENTIRE_BATCH') NOT NULL,
    `mapping` JSON NOT NULL,
    `status` ENUM('VALIDATED', 'QUEUED', 'IMPORTING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED', 'AWAITING_APPROVAL') NOT NULL DEFAULT 'VALIDATED',
    `totalRows` INTEGER NOT NULL DEFAULT 0,
    `validRows` INTEGER NOT NULL DEFAULT 0,
    `invalidRows` INTEGER NOT NULL DEFAULT 0,
    `duplicateRows` INTEGER NOT NULL DEFAULT 0,
    `importedRows` INTEGER NOT NULL DEFAULT 0,
    `updatedRows` INTEGER NOT NULL DEFAULT 0,
    `skippedRows` INTEGER NOT NULL DEFAULT 0,
    `failedRows` INTEGER NOT NULL DEFAULT 0,
    `message` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ImportBatch_reference_key`(`reference`),
    UNIQUE INDEX `ImportBatch_idempotencyKey_key`(`idempotencyKey`),
    INDEX `ImportBatch_createdAt_idx`(`createdAt`),
    INDEX `ImportBatch_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportRow` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `data` JSON NOT NULL,
    `status` ENUM('VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'UPDATED', 'SKIPPED', 'FAILED') NOT NULL,
    `errors` JSON NOT NULL,
    `duplicateOfId` VARCHAR(191) NULL,
    `resultId` VARCHAR(191) NULL,

    INDEX `ImportRow_batchId_status_idx`(`batchId`, `status`),
    UNIQUE INDEX `ImportRow_batchId_rowNumber_key`(`batchId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BulkActionBatch` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `action` ENUM('ARCHIVE', 'UNARCHIVE', 'SOFT_DELETE', 'RESTORE', 'REASSIGN', 'CHANGE_STATUS', 'EXPORT') NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `parameters` JSON NULL,
    `recordIds` JSON NOT NULL,
    `affectedCount` INTEGER NOT NULL,
    `skipped` JSON NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,

    UNIQUE INDEX `BulkActionBatch_reference_key`(`reference`),
    INDEX `BulkActionBatch_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeletionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityIds` JSON NOT NULL,
    `reason` TEXT NOT NULL,
    `checks` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'BLOCKED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `requestedById` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `requesterReauthAt` DATETIME(3) NOT NULL,
    `approverId` VARCHAR(191) NULL,
    `approverReauthAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionComment` TEXT NULL,
    `executedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DeletionRequest_reference_key`(`reference`),
    INDEX `DeletionRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurgeToken` (
    `caseId` VARCHAR(191) NOT NULL,
    `connectionId` BIGINT UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`caseId`, `connectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Job` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `runAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastError` TEXT NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `Job_status_runAfter_idx`(`status`, `runAfter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratedReport` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `format` ENUM('PDF', 'DOCX', 'XLSX', 'CSV') NOT NULL,
    `filters` JSON NULL,
    `rowCount` INTEGER NOT NULL,
    `fileId` VARCHAR(191) NULL,
    `isFinal` BOOLEAN NOT NULL DEFAULT false,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `generatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GeneratedReport_reference_key`(`reference`),
    INDEX `GeneratedReport_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `link` TEXT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    UNIQUE INDEX `Notification_userId_dedupeKey_key`(`userId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorId` VARCHAR(191) NULL,
    `actorLabel` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
    `reason` TEXT NULL,
    `requestId` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(300) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `details` JSON NULL,

    INDEX `AuditLog_at_idx`(`at`),
    INDEX `AuditLog_actorId_at_idx`(`actorId`, `at`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_caseId_at_idx`(`caseId`, `at`),
    INDEX `AuditLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityAlert` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('REPEATED_FAILED_LOGINS', 'PERMISSION_BYPASS_ATTEMPT', 'LARGE_EXPORT', 'EVIDENCE_HASH_MISMATCH', 'ADMIN_ROLE_CHANGE', 'DEMO_MODE_IN_PRODUCTION', 'PERMANENT_DELETION', 'BULK_IMPORT_FAILURE') NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'HIGH', 'CRITICAL') NOT NULL,
    `message` TEXT NOT NULL,
    `subjectUserId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SecurityAlert_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `SecurityAlert_acknowledgedAt_idx`(`acknowledgedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessRequest` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NULL,
    `email` VARCHAR(254) NULL,
    `telephone` VARCHAR(191) NULL,
    `employeeNumber` VARCHAR(191) NULL,
    `jobTitle` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NULL,
    `requestedRole` ENUM('SYSTEM_ADMIN', 'LEAD_INVESTIGATOR', 'INVESTIGATOR', 'INTERNAL_AUDIT_REVIEWER', 'COMPLIANCE_REVIEWER', 'LEGAL_OFFICER', 'HR_OFFICER', 'FINANCE_REVIEWER', 'MANAGEMENT_APPROVER', 'EXECUTIVE_READ_ONLY', 'EXTERNAL_ADVOCATE_RESTRICTED') NULL,
    `justification` TEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionComment` TEXT NULL,
    `createdUserId` VARCHAR(191) NULL,

    UNIQUE INDEX `AccessRequest_reference_key`(`reference`),
    UNIQUE INDEX `AccessRequest_createdUserId_key`(`createdUserId`),
    INDEX `AccessRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `AccessRequest_email_idx`(`email`),
    INDEX `AccessRequest_username_idx`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChangeRequest` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `resourceKey` VARCHAR(191) NOT NULL,
    `operation` ENUM('CREATE', 'UPDATE', 'IMPORT') NOT NULL,
    `recordId` VARCHAR(191) NULL,
    `caseId` VARCHAR(191) NULL,
    `summary` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `baseVersion` INTEGER NULL,
    `status` ENUM('PENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `requestedById` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewComment` TEXT NULL,
    `appliedRecordId` VARCHAR(191) NULL,
    `failureReason` TEXT NULL,

    UNIQUE INDEX `ChangeRequest_reference_key`(`reference`),
    INDEX `ChangeRequest_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `ChangeRequest_requestedById_status_idx`(`requestedById`, `status`),
    INDEX `ChangeRequest_resourceKey_recordId_status_idx`(`resourceKey`, `recordId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserScope` ADD CONSTRAINT `UserScope_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserScope` ADD CONSTRAINT `UserScope_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserScope` ADD CONSTRAINT `UserScope_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_leadInvestigatorId_fkey` FOREIGN KEY (`leadInvestigatorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_supervisingManagerId_fkey` FOREIGN KEY (`supervisingManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Case` ADD CONSTRAINT `Case_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseAssignment` ADD CONSTRAINT `CaseAssignment_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseAssignment` ADD CONSTRAINT `CaseAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseStatusHistory` ADD CONSTRAINT `CaseStatusHistory_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseClosure` ADD CONSTRAINT `CaseClosure_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseReopening` ADD CONSTRAINT `CaseReopening_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubFile` ADD CONSTRAINT `SubFile_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubFile` ADD CONSTRAINT `SubFile_investigatorId_fkey` FOREIGN KEY (`investigatorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Party` ADD CONSTRAINT `Party_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cheque` ADD CONSTRAINT `Cheque_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cheque` ADD CONSTRAINT `Cheque_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cheque` ADD CONSTRAINT `Cheque_replacementChequeId_fkey` FOREIGN KEY (`replacementChequeId`) REFERENCES `Cheque`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChequeInvoice` ADD CONSTRAINT `ChequeInvoice_chequeId_fkey` FOREIGN KEY (`chequeId`) REFERENCES `Cheque`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChequeInvoice` ADD CONSTRAINT `ChequeInvoice_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_signedStatementId_fkey` FOREIGN KEY (`signedStatementId`) REFERENCES `PartyStatement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyStatement` ADD CONSTRAINT `PartyStatement_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyStatement` ADD CONSTRAINT `PartyStatement_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartyStatement` ADD CONSTRAINT `PartyStatement_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkLog` ADD CONSTRAINT `WorkLog_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkLog` ADD CONSTRAINT `WorkLog_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkLog` ADD CONSTRAINT `WorkLog_investigatorId_fkey` FOREIGN KEY (`investigatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkLog` ADD CONSTRAINT `WorkLog_responsibleOfficerId_fkey` FOREIGN KEY (`responsibleOfficerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_sourceWorkLogId_fkey` FOREIGN KEY (`sourceWorkLogId`) REFERENCES `WorkLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceVersion` ADD CONSTRAINT `EvidenceVersion_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceAccess` ADD CONSTRAINT `EvidenceAccess_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceAccess` ADD CONSTRAINT `EvidenceAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustodyEvent` ADD CONSTRAINT `CustodyEvent_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustodyEvent` ADD CONSTRAINT `CustodyEvent_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Finding` ADD CONSTRAINT `Finding_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Finding` ADD CONSTRAINT `Finding_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recommendation` ADD CONSTRAINT `Recommendation_findingId_fkey` FOREIGN KEY (`findingId`) REFERENCES `Finding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManagementDecision` ADD CONSTRAINT `ManagementDecision_findingId_fkey` FOREIGN KEY (`findingId`) REFERENCES `Finding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CriminalMatter` ADD CONSTRAINT `CriminalMatter_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CriminalMilestone` ADD CONSTRAINT `CriminalMilestone_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `CriminalMatter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CivilMatter` ADD CONSTRAINT `CivilMatter_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourtEvent` ADD CONSTRAINT `CourtEvent_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `CivilMatter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisciplinaryCase` ADD CONSTRAINT `DisciplinaryCase_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WriteOff` ADD CONSTRAINT `WriteOff_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WriteOff` ADD CONSTRAINT `WriteOff_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_advanceId_fkey` FOREIGN KEY (`advanceId`) REFERENCES `Advance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Advance` ADD CONSTRAINT `Advance_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Advance` ADD CONSTRAINT `Advance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Budget` ADD CONSTRAINT `Budget_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recovery` ADD CONSTRAINT `Recovery_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recovery` ADD CONSTRAINT `Recovery_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recovery` ADD CONSTRAINT `Recovery_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recovery` ADD CONSTRAINT `Recovery_chequeId_fkey` FOREIGN KEY (`chequeId`) REFERENCES `Cheque`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recovery` ADD CONSTRAINT `Recovery_civilMatterId_fkey` FOREIGN KEY (`civilMatterId`) REFERENCES `CivilMatter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialStatement` ADD CONSTRAINT `FinancialStatement_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialStatement` ADD CONSTRAINT `FinancialStatement_subFileId_fkey` FOREIGN KEY (`subFileId`) REFERENCES `SubFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialStatement` ADD CONSTRAINT `FinancialStatement_relatedPartyId_fkey` FOREIGN KEY (`relatedPartyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StatementTransaction` ADD CONSTRAINT `StatementTransaction_statementId_fkey` FOREIGN KEY (`statementId`) REFERENCES `FinancialStatement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransactionLink` ADD CONSTRAINT `TransactionLink_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `StatementTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnownAccount` ADD CONSTRAINT `KnownAccount_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnownAccount` ADD CONSTRAINT `KnownAccount_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportRow` ADD CONSTRAINT `ImportRow_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ImportBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedReport` ADD CONSTRAINT `GeneratedReport_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeRequest` ADD CONSTRAINT `ChangeRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeRequest` ADD CONSTRAINT `ChangeRequest_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeRequest` ADD CONSTRAINT `ChangeRequest_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
