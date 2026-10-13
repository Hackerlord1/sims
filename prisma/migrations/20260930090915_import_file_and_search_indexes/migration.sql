-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "fileId" TEXT;

-- CreateIndex
CREATE INDEX "case_title_trgm" ON "Case" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "case_reference_trgm" ON "Case" USING GIN ("reference" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "invoice_customer_trgm" ON "Invoice" USING GIN ("customerName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "invoice_number_trgm" ON "Invoice" USING GIN ("invoiceNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "party_name_trgm" ON "Party" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "txn_counterparty_trgm" ON "StatementTransaction" USING GIN ("counterpartyName" gin_trgm_ops);
