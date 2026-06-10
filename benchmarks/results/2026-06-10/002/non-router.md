| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 42.051 | ms |
| virtual measured tail refresh | 26.232 | ms |
| virtual subscribed measured tail refresh | 37.950 | ms |
| virtual 60 frame scroll refresh 100k rows | 12.669 | ms |
| virtual stale measured refresh | 38.394 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.739 | ms |
| query deep-key observer updates | 113.527 | ms |
| query notification fanout 1k observers | 78.936 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 68.723 | ms |
| forms many schema issues on one field | 3.218 | ms |
| forms 100 field sequential key input | 71.124 | ms |
| auth current session with large payload | 39.883 | ms |
