| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 30.513 | ms |
| virtual measured tail refresh | 20.020 | ms |
| virtual subscribed measured tail refresh | 33.485 | ms |
| virtual 60 frame scroll refresh 100k rows | 18.886 | ms |
| virtual stale measured refresh | 18.249 | ms |
| virtual repeated scrollToKey large list head middle tail | 38.584 | ms |
| query deep-key observer updates | 74.540 | ms |
| query notification fanout 1k observers | 68.356 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 52.933 | ms |
| forms many schema issues on one field | 2.729 | ms |
| forms 100 field sequential key input | 6.524 | ms |
| auth current session with large payload | 33.892 | ms |
