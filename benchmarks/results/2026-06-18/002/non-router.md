| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.136 | ms |
| virtual measured tail refresh | 20.590 | ms |
| virtual subscribed measured tail refresh | 33.375 | ms |
| virtual 60 frame scroll refresh 100k rows | 20.461 | ms |
| virtual stale measured refresh | 19.252 | ms |
| virtual repeated scrollToKey large list head middle tail | 39.196 | ms |
| query deep-key observer updates | 80.568 | ms |
| query notification fanout 1k observers | 72.875 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 60.790 | ms |
| forms many schema issues on one field | 2.579 | ms |
| forms 100 field sequential key input | 6.569 | ms |
| auth current session with large payload | 38.208 | ms |
