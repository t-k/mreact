| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.399 | ms |
| virtual measured tail refresh | 5.640 | ms |
| virtual subscribed measured tail refresh | 808.523 | ms |
| virtual 60 frame scroll refresh 100k rows | 5.733 | ms |
| virtual stale measured refresh | 8.695 | ms |
| virtual repeated scrollToKey large list head middle tail | 19.549 | ms |
| query deep-key observer updates | 100.399 | ms |
| query notification fanout 1k observers | 80.350 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 28.760 | ms |
| forms many schema issues on one field | 2.111 | ms |
| forms 100 field sequential key input | 2.840 | ms |
| auth current session with large payload | 22.471 | ms |
