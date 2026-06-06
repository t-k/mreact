| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 44.349 | ms |
| virtual measured tail refresh | 23.881 | ms |
| virtual subscribed measured tail refresh | 38.345 | ms |
| virtual 60 frame scroll refresh 100k rows | 12.749 | ms |
| virtual stale measured refresh | 38.285 | ms |
| virtual repeated scrollToKey large list head middle tail | 30.034 | ms |
| query deep-key observer updates | 122.675 | ms |
| query notification fanout 1k observers | 67.454 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 68.977 | ms |
| forms many schema issues on one field | 62.393 | ms |
| forms 100 field sequential key input | 7.702 | ms |
| auth current session with large payload | 33.357 | ms |
