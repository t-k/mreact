| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 47.985 | ms |
| virtual measured tail refresh | 9.387 | ms |
| virtual subscribed measured tail refresh | 45.093 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.257 | ms |
| virtual stale measured refresh | 33.548 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.974 | ms |
| query deep-key observer updates | 132.213 | ms |
| query notification fanout 1k observers | 88.556 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 79.664 | ms |
| forms many schema issues on one field | 2.782 | ms |
| forms 100 field sequential key input | 8.931 | ms |
| auth current session with large payload | 30.791 | ms |
