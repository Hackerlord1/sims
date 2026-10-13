-- Removes the forced password change at first sign-in (decision 2026-10-07): passwords issued by an
-- administrator, by `npm run create-admin` or by the seed are kept until the user changes them
-- voluntarily (Change password in the account menu).

-- AlterTable
ALTER TABLE `User` DROP COLUMN `mustChangePassword`;
