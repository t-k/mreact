| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 35.772 | ms |
| virtual measured tail refresh | 20.502 | ms |
| virtual subscribed measured tail refresh | 36.071 | ms |
| virtual 60 frame scroll refresh 100k rows | 20.337 | ms |
| virtual stale measured refresh | 20.190 | ms |
| virtual repeated scrollToKey large list head middle tail | 36.577 | ms |
| query deep-key observer updates | 89.282 | ms |
| query notification fanout 1k observers | 76.811 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 49.765 | ms |
| forms many schema issues on one field | 2.470 | ms |
| forms 100 field sequential key input | 7.534 | ms |
| auth current session with large payload | 32.800 | ms |
