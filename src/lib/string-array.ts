// Lists of strings are stored in Json columns (MariaDB has no array type): User.permissionDenials,
// StatementTransaction.flags, ImportRow.errors, BulkActionBatch.recordIds, DeletionRequest.entityIds.
// Prisma types them as JsonValue, so every read goes through this check.

/**
 * Returns the value as string[]. Anything else is a data error and throws rather than reading as
 * an empty list: for permission denials an empty list would silently grant every permission.
 */
export function stringArray(value: unknown, field = "value"): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`${field} must be a JSON array of strings.`);
  }
  return value;
}
