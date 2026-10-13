-- CreateIndex
CREATE INDEX `Invoice_isDeleted_archivedAt_invoiceDate_idx` ON `Invoice`(`isDeleted`, `archivedAt`, `invoiceDate`);
