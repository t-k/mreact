| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 49.360 | ms |
| virtual measured tail refresh | 8.620 | ms |
| virtual subscribed measured tail refresh | 42.184 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.780 | ms |
| virtual stale measured refresh | 33.597 | ms |
| virtual repeated scrollToKey large list head middle tail | 30.926 | ms |
| query deep-key observer updates | 134.553 | ms |
| query notification fanout 1k observers | 120.556 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 135.306 | ms |
| forms many schema issues on one field | 2.907 | ms |
| forms 100 field sequential key input | 8.905 | ms |
| auth current session with large payload | 32.657 | ms |
