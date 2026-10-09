| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 52.649 | ms |
| virtual measured tail refresh | 11.124 | ms |
| virtual subscribed measured tail refresh | 1246.738 | ms |
| virtual 60 frame scroll refresh 100k rows | 10.642 | ms |
| virtual stale measured refresh | 16.706 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.535 | ms |
| query deep-key observer updates | 170.469 | ms |
| query notification fanout 1k observers | 148.356 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 58.576 | ms |
| forms many schema issues on one field | 3.398 | ms |
| forms 100 field sequential key input | 4.986 | ms |
| auth current session with large payload | 47.916 | ms |
