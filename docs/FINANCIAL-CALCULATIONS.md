# Financial calculations

Every figure SIMS shows is computed on the server from its source records by the pure functions in
[`src/lib/finance.ts`](../src/lib/finance.ts), which are unit-tested in `src/lib/finance.test.ts`. The
same functions feed the case file, dashboards, reports and exports, so a figure is the same wherever it
appears. Investigators type in only the exposure amounts; recovered, written-off and cost figures are
always derived.

## Money arithmetic

- Amounts are stored as `DECIMAL(18,2)` in MariaDB and handled as arbitrary-precision decimals
  (`decimal.js`, 34 significant digits) in code. Floating-point numbers are never used for money.
- Stored amounts are rounded to cents with banker's rounding (round half to even).
- Percentages are rounded to two decimal places, also half-to-even.
- The currency defaults to KES and is configurable per case (`Case.currency`).
- **Zero-safe ratios:** a percentage whose denominator is zero or negative is shown as “—” (no value),
  never as 0 %, infinity or an error.

## Which records count

| Record         | Counted when                                                                                                                                                                                      | Amount used                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Expense        | status is Approved, Partially approved, Paid, Awaiting receipt, Accounted for or Closed                                                                                                           | `approvedAmount`                             |
| Recovery       | status is **Verified** (recorded but unverified receipts are excluded)                                                                                                                            | `grossAmount`                                |
| Recovery costs | on a Verified recovery                                                                                                                                                                            | `recoveryCosts`                              |
| Write-off      | status is Approved or Closed                                                                                                                                                                      | `amount`                                     |
| Budget         | any status except Proposed                                                                                                                                                                        | `approvedAmount`                             |
| Invoice        | classification is Customer not identified, No proof of delivery, Duplicate, Fictitious invoice suspected, Payment made to employee, Cash collected not remitted or M-Pesa paid to personal number | `invoiceAmount − amountPaid` (never below 0) |
| Cheque         | status is Dishonoured, or a dishonour date is recorded                                                                                                                                            | `amount`                                     |

Soft-deleted records are excluded everywhere.

## Case figures

| Figure                            | Formula                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Internal investigation expenses   | Σ counted expenses with pathway _Investigation_                                      |
| Criminal action expenses          | Σ counted expenses with pathway _Criminal_                                           |
| Civil action expenses             | Σ counted expenses with pathway _Civil_                                              |
| Recovery and enforcement expenses | Σ counted expenses with pathway _Recovery_ + Σ recovery costs on verified recoveries |
| **Total Investigation Cost**      | Internal + Criminal + Civil + Recovery and enforcement expenses                      |
| **Gross Recovery**                | Σ gross amount of verified recoveries                                                |
| **Net Recovery**                  | Gross Recovery − Total Investigation Cost (may be negative)                          |
| **Outstanding Principal**         | Confirmed Recoverable − Gross Recovery                                               |
| Remaining exposure                | Confirmed Recoverable − Gross Recovery − approved write-offs                         |
| **Recovery Rate**                 | Gross Recovery ÷ Confirmed Recoverable × 100 (— when Confirmed Recoverable is 0)     |
| **Cost-to-Recovery Ratio**        | Total Investigation Cost ÷ Gross Recovery × 100 (— when nothing has been recovered)  |
| Unsupported invoice value         | Σ outstanding balance of invoices in the unsupported classifications above           |
| Bad-cheque value                  | Σ amount of dishonoured cheques                                                      |
| Over-recovered warning            | shown when recoveries plus write-offs exceed the Confirmed Recoverable amount        |

A single recovery also shows its own net amount: gross amount − recovery costs.

## Budgets

Per pathway (Investigation, Criminal, Civil, Recovery) and in total:

| Figure                 | Formula                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| Actual                 | the pathway's expense total as defined above (recovery costs count as Recovery) |
| **Budget Variance**    | Approved Budget − Actual (negative means over budget)                           |
| **Budget Utilisation** | Actual ÷ Approved Budget × 100 (— when no budget is approved)                   |

## Advances and imprests

With _issued_ = amount issued, _actual_ = Σ approved expenses accounted against the advance and
_returned_ = cash returned:

| Figure                                | Formula                            |
| ------------------------------------- | ---------------------------------- |
| Unused balance                        | max(issued − actual, 0)            |
| Additional amount due to the employee | max(actual − issued, 0)            |
| Outstanding balance                   | max(issued − actual − returned, 0) |

An advance is flagged **unaccounted** when it is Issued or Partly accounted, its accounting deadline has
passed and the outstanding balance is above zero.

## Expenses

- Total amount = amount before tax + tax; neither may be negative.
- An approval may not exceed the requested amount. Approving 0 rejects the expense, approving less than
  requested marks it _Partially approved_, and the difference is recorded as the rejected amount.
- The person who requested an expense can never approve it (maker-checker), and the same rule applies to
  advances, budgets, write-offs and recovery verification.

## Worked example

Confirmed Recoverable KES 1,000,000; verified recoveries KES 300,000 (with KES 5,000 recovery costs);
counted expenses: Investigation 40,000, Criminal 10,000, Civil 25,000, Recovery 0; approved write-off
KES 100,000.

- Total Investigation Cost = 40,000 + 10,000 + 25,000 + (0 + 5,000) = **80,000**
- Net Recovery = 300,000 − 80,000 = **220,000**
- Outstanding Principal = 1,000,000 − 300,000 = **700,000**
- Remaining exposure = 1,000,000 − 300,000 − 100,000 = **600,000**
- Recovery Rate = 300,000 ÷ 1,000,000 × 100 = **30.00 %**
- Cost-to-Recovery Ratio = 80,000 ÷ 300,000 × 100 = **26.67 %**
