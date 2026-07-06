| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 53.279 | ms |
| virtual measured tail refresh | 10.033 | ms |
| virtual subscribed measured tail refresh | 45.147 | ms |
| virtual 60 frame scroll refresh 100k rows | 12.398 | ms |
| virtual stale measured refresh | 32.992 | ms |
| virtual repeated scrollToKey large list head middle tail | 30.055 | ms |
| query deep-key observer updates | 127.045 | ms |
| query notification fanout 1k observers | 103.743 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 76.238 | ms |
| forms many schema issues on one field | 64.987 | ms |
| forms 100 field sequential key input | 9.277 | ms |
| auth current session with large payload | 33.014 | ms |
