# Performance results

Measured 2026-10-07T12:30:57.578Z with `npm run perf` against the fictional `sims_perf` dataset loaded by `npm run load-data`.

Machine: Intel(R) Core(TM) i5-7300U CPU @ 2.60GHz × 4, 8 GB RAM, Windows_NT 10.0.21996, Node v24.20.0. MariaDB on the same machine.

Requests run through the real API router in-process (session, CSRF, validation, permissions, row scoping, database), so network and TLS time is excluded. Each scenario has two warm-up requests, then 15 timed requests unless stated.

## Dataset

| Records               |   Count |
| --------------------- | ------: |
| cases                 |   5,005 |
| invoices              | 100,030 |
| parties               |  15,050 |
| tasks                 |  10,007 |
| statementTransactions | 100,019 |
| transactionLinks      | 112,903 |
| auditLogs             | 200,093 |

## Results

| Scenario                                                 | Runs | p50 (ms) | p95 (ms) | Max (ms) | Response size | p95 budget (ms) | Result |
| -------------------------------------------------------- | ---: | -------: | -------: | -------: | ------------: | --------------: | ------ |
| Case list, first page                                    |   15 |       23 |       25 |       25 |       38.5 KB |             500 | Pass   |
| Case list, page 150 sorted by reference                  |   15 |       62 |       66 |       66 |       38.3 KB |             700 | Pass   |
| Case list, text search                                   |   15 |       25 |       28 |       28 |       38.4 KB |             800 | Pass   |
| Case file summary (financial figures)                    |   15 |       24 |       30 |       30 |        2.8 KB |             500 | Pass   |
| Case invoices tab                                        |   15 |       18 |       21 |       21 |       24.5 KB |             400 | Pass   |
| Invoice register (all cases), first page                 |   15 |      269 |      278 |      278 |       62.0 KB |             700 | Pass   |
| Invoice register, invoice-number search                  |   15 |      396 |      440 |      440 |       61.1 KB |             800 | Pass   |
| Task register, first page                                |   15 |       54 |       82 |       82 |       48.4 KB |             700 | Pass   |
| Dashboard                                                |   15 |      137 |      178 |      178 |        7.5 KB |            1500 | Pass   |
| Global search                                            |   15 |      462 |      517 |      517 |        8.7 KB |            1500 | Pass   |
| Statement transactions, first page                       |   15 |       59 |       91 |       91 |       69.6 KB |             600 | Pass   |
| Statement transactions, flag filter                      |   15 |      115 |      126 |      126 |       70.8 KB |            1000 | Pass   |
| Statement suggested links                                |   15 |      108 |      113 |      113 |       33.2 KB |             600 | Pass   |
| Statement overview (totals and flag counts)              |   15 |      176 |      201 |      201 |        1.6 KB |            1000 | Pass   |
| Money movement (all statements of the case)              |    8 |     1029 |     1575 |     1575 |      414.8 KB |            4000 | Pass   |
| Statement transaction schedule export (10,000 rows, CSV) |    5 |      613 |      653 |      653 |     2015.4 KB |            5000 | Pass   |
| Audit log, first page                                    |   15 |       47 |       57 |       57 |       25.5 KB |             800 | Pass   |
| Audit log, filtered by case                              |   15 |        8 |        8 |        8 |       14.7 KB |             800 | Pass   |
| Export one case's invoices (CSV)                         |    8 |       23 |       25 |       25 |        4.2 KB |            1500 | Pass   |
| Export 25,104 disputed invoices (CSV)                    |    3 |     3922 |     3926 |     3926 |     4408.2 KB |           20000 | Pass   |
| Export refused above the 50,000-row cap (100,030 rows)   |    5 |      258 |      271 |      271 |        0.2 KB |            1000 | Pass   |

## Background jobs

| Job                                                                                                        | Duration |                          Budget | Result |
| ---------------------------------------------------------------------------------------------------------- | -------: | ------------------------------: | ------ |
| Statement analysis of 100,019 transactions across 10 statements (99,941 flagged, 112,889 link suggestions) |   28.2 s | 120 s (job transaction timeout) | Pass   |

All scenarios met their budgets.
