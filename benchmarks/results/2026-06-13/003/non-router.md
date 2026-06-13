| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.326 | ms |
| virtual measured tail refresh | 19.204 | ms |
| virtual subscribed measured tail refresh | 32.497 | ms |
| virtual 60 frame scroll refresh 100k rows | 19.494 | ms |
| virtual stale measured refresh | 19.098 | ms |
| virtual repeated scrollToKey large list head middle tail | 35.366 | ms |
| query deep-key observer updates | 89.076 | ms |
| query notification fanout 1k observers | 72.963 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 54.372 | ms |
| forms many schema issues on one field | 2.612 | ms |
| forms 100 field sequential key input | 7.910 | ms |
| auth current session with large payload | 90.112 | ms |
