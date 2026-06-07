| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 38.244 | ms |
| virtual measured tail refresh | 24.325 | ms |
| virtual subscribed measured tail refresh | 39.407 | ms |
| virtual 60 frame scroll refresh 100k rows | 12.905 | ms |
| virtual stale measured refresh | 38.386 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.305 | ms |
| query deep-key observer updates | 129.700 | ms |
| query notification fanout 1k observers | 76.951 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 72.743 | ms |
| forms many schema issues on one field | 54.813 | ms |
| forms 100 field sequential key input | 7.310 | ms |
| auth current session with large payload | 40.197 | ms |
