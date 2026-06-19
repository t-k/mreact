| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 32.290 | ms |
| virtual measured tail refresh | 21.814 | ms |
| virtual subscribed measured tail refresh | 36.216 | ms |
| virtual 60 frame scroll refresh 100k rows | 22.001 | ms |
| virtual stale measured refresh | 29.816 | ms |
| virtual repeated scrollToKey large list head middle tail | 54.438 | ms |
| query deep-key observer updates | 88.653 | ms |
| query notification fanout 1k observers | 78.241 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 53.487 | ms |
| forms many schema issues on one field | 2.523 | ms |
| forms 100 field sequential key input | 7.029 | ms |
| auth current session with large payload | 35.538 | ms |
