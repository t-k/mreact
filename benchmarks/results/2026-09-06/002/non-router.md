| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 57.166 | ms |
| virtual measured tail refresh | 11.020 | ms |
| virtual subscribed measured tail refresh | 1224.684 | ms |
| virtual 60 frame scroll refresh 100k rows | 9.556 | ms |
| virtual stale measured refresh | 16.181 | ms |
| virtual repeated scrollToKey large list head middle tail | 26.317 | ms |
| query deep-key observer updates | 186.868 | ms |
| query notification fanout 1k observers | 172.267 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 56.100 | ms |
| forms many schema issues on one field | 2.913 | ms |
| forms 100 field sequential key input | 21.813 | ms |
| auth current session with large payload | 39.882 | ms |
