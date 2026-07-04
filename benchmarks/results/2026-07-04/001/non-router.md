| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 46.816 | ms |
| virtual measured tail refresh | 14.235 | ms |
| virtual subscribed measured tail refresh | 39.034 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.671 | ms |
| virtual stale measured refresh | 33.843 | ms |
| virtual repeated scrollToKey large list head middle tail | 33.669 | ms |
| query deep-key observer updates | 142.723 | ms |
| query notification fanout 1k observers | 113.340 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 76.264 | ms |
| forms many schema issues on one field | 61.068 | ms |
| forms 100 field sequential key input | 9.184 | ms |
| auth current session with large payload | 32.385 | ms |
