| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 33.707 | ms |
| virtual measured tail refresh | 20.140 | ms |
| virtual subscribed measured tail refresh | 33.285 | ms |
| virtual 60 frame scroll refresh 100k rows | 20.253 | ms |
| virtual stale measured refresh | 20.195 | ms |
| virtual repeated scrollToKey large list head middle tail | 40.054 | ms |
| query deep-key observer updates | 94.388 | ms |
| query notification fanout 1k observers | 81.231 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 50.693 | ms |
| forms many schema issues on one field | 2.411 | ms |
| forms 100 field sequential key input | 6.475 | ms |
| auth current session with large payload | 93.142 | ms |
