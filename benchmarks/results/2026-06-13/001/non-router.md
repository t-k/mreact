| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 39.965 | ms |
| virtual measured tail refresh | 18.280 | ms |
| virtual subscribed measured tail refresh | 37.003 | ms |
| virtual 60 frame scroll refresh 100k rows | 23.051 | ms |
| virtual stale measured refresh | 19.512 | ms |
| virtual repeated scrollToKey large list head middle tail | 39.536 | ms |
| query deep-key observer updates | 94.583 | ms |
| query notification fanout 1k observers | 86.619 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 52.611 | ms |
| forms many schema issues on one field | 2.486 | ms |
| forms 100 field sequential key input | 7.825 | ms |
| auth current session with large payload | 101.477 | ms |
