| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 46.911 | ms |
| virtual measured tail refresh | 9.600 | ms |
| virtual subscribed measured tail refresh | 43.219 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.414 | ms |
| virtual stale measured refresh | 33.337 | ms |
| virtual repeated scrollToKey large list head middle tail | 28.332 | ms |
| query deep-key observer updates | 127.415 | ms |
| query notification fanout 1k observers | 91.973 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 87.137 | ms |
| forms many schema issues on one field | 2.692 | ms |
| forms 100 field sequential key input | 10.030 | ms |
| auth current session with large payload | 32.380 | ms |
