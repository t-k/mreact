| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 44.079 | ms |
| virtual measured tail refresh | 6.941 | ms |
| virtual subscribed measured tail refresh | 35.064 | ms |
| virtual 60 frame scroll refresh 100k rows | 10.928 | ms |
| virtual stale measured refresh | 27.315 | ms |
| virtual repeated scrollToKey large list head middle tail | 26.382 | ms |
| query deep-key observer updates | 106.822 | ms |
| query notification fanout 1k observers | 93.064 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 58.160 | ms |
| forms many schema issues on one field | 54.311 | ms |
| forms 100 field sequential key input | 7.481 | ms |
| auth current session with large payload | 26.309 | ms |
