"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RegisterPage } from "@/components/resources/register-page";
import { UploadStatementDialog } from "@/components/statements/upload-statement";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { LeadNotice } from "@/components/ui/states";

export function StatementsRegister() {
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <RegisterPage
        resource="financial-statements"
        description={
          <>
            Restricted financial-analysis module. Originals are preserved unchanged; analysis runs on a copy. <LeadNotice className="mt-2" />
          </>
        }
        actions={
          can("STATEMENTS", "CREATE") ? (
            <Button onClick={() => setOpen(true)}>
              <Upload className="h-4 w-4" aria-hidden /> Upload statement
            </Button>
          ) : null
        }
        table={{ onOpen: (row) => router.push(`/statements/${row.id}`) }}
      />
      {open ? <UploadStatementDialog open={open} onOpenChange={setOpen} onUploaded={(id) => router.push(`/statements/${id}`)} /> : null}
    </>
  );
}
